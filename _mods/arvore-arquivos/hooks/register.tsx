import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Atividade, Projeto } from '../types'

const PANE = 'arvore'
const projeto = atom({ plugin: 'arvore-arquivos', key: 'projeto' } as const, null)
const ativos = atom({ plugin: 'arvore-arquivos', key: 'ativos' } as const, {})
const tocados = atom({ plugin: 'arvore-arquivos', key: 'tocados' } as const, [])
const abertas = atom({ plugin: 'arvore-arquivos', key: 'abertas' } as const, [])
const fechadas = atom({ plugin: 'arvore-arquivos', key: 'fechadas' } as const, [])

const LIMITE_ARQUIVOS = 4000
const LIMITE_LINHAS = 500
const IGNORAR = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.next', '__pycache__', '.venv'])
const EDITAM = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const linhas = (s: string) => s.split('\n').filter(Boolean)

const rodar = async ($: EngineInterface, argv: string[], cwd: string) => {
  try {
    const r = await $.process.run(argv, { cwd, timeoutMs: 10_000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

// Sem git: lista as pastas até 4 níveis, pulando as pesadas.
const varrer = async ($: EngineInterface, raiz: string) => {
  const achados: string[] = []
  const fila: [string, number][] = [['', 0]]
  while (fila.length && achados.length < LIMITE_ARQUIVOS) {
    const [rel, nivel] = fila.shift() ?? ['', 0]
    const entradas = await $.fs.list(rel ? `${raiz}/${rel}` : raiz).catch(() => [])
    for (const en of entradas) {
      const caminho = rel ? `${rel}/${en.name}` : en.name
      if (en.kind === 'dir' && !IGNORAR.has(en.name) && nivel < 4) fila.push([caminho, nivel + 1])
      else if (en.kind === 'file') achados.push(caminho)
    }
  }
  return achados
}

export const statusGit = (porcelain: string) => {
  const mapa: Record<string, string> = {}
  for (const l of linhas(porcelain)) {
    const codigo = l.slice(0, 2).trim() || 'M'
    const caminho = l.slice(3).split(' -> ').pop() ?? ''
    mapa[caminho.replace(/^"|"$/g, '')] = codigo.startsWith('?') ? '??' : (codigo[0] === ' ' ? codigo[1] : codigo[0]) ?? 'M'
  }
  return mapa
}

const lerGit = async ($: EngineInterface, raiz: string) => {
  const mapa: Record<string, string> = {}
  for (const f of linhas((await rodar($, ['git', 'log', '@{u}..HEAD', '--name-only', '--pretty=format:'], raiz)) ?? '')) mapa[f] = 'C'
  return { ...mapa, ...statusGit((await rodar($, ['git', 'status', '--porcelain=v1', '-uall'], raiz)) ?? '') }
}

const carregar = async ($: EngineInterface) => {
  const cwd = await $.session.cwd()
  const topo = (await rodar($, ['git', 'rev-parse', '--show-toplevel'], cwd))?.trim()
  const novo: Projeto = topo
    ? {
        raiz: topo,
        isGit: true,
        arquivos: linhas((await rodar($, ['git', 'ls-files', '--cached', '--others', '--exclude-standard'], topo)) ?? '').slice(0, LIMITE_ARQUIVOS),
        git: await lerGit($, topo),
      }
    : { raiz: cwd, isGit: false, arquivos: await varrer($, cwd), git: {} }
  await update($, projeto, () => novo)
}

const atualizarGit = async ($: EngineInterface) => {
  const p = await read($, projeto)
  if (!p?.isGit) return
  const git = await lerGit($, p.raiz)
  await update($, projeto, atual => atual && { ...atual, git })
}

type No = { nome: string; caminho: string; filhos: Map<string, No>; isDir: boolean }

const montar = (caminhos: Iterable<string>) => {
  const raiz: No = { nome: '', caminho: '', filhos: new Map(), isDir: true }
  for (const c of caminhos) {
    let atual = raiz
    const partes = c.split('/')
    partes.forEach((nome, i) => {
      const caminho = partes.slice(0, i + 1).join('/')
      let filho = atual.filhos.get(nome)
      if (!filho) {
        filho = { nome, caminho, filhos: new Map(), isDir: i < partes.length - 1 }
        atual.filhos.set(nome, filho)
      }
      atual = filho
    })
  }
  return raiz
}

const ordenar = (n: No) => [...n.filhos.values()].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.nome.localeCompare(b.nome))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'arvore', description: 'Abre a árvore de arquivos do projeto' })
    void carregar($)
      .then(() => $.ui.open({ id: PANE, title: 'Arquivos' }))
      .catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'arvore' }, async $ => {
    await carregar($)
    await $.ui.open({ id: PANE, title: 'Arquivos', focus: true })
    return { text: 'Árvore de arquivos aberta.' }
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (tool === 'Bash') {
      const ran = await next(e)
      await atualizarGit($)
      return ran
    }
    const args = e as unknown as { file_path?: string; notebook_path?: string }
    const absoluto = args.file_path ?? args.notebook_path
    const p = await read($, projeto)
    if ((tool !== 'Read' && !EDITAM.has(tool)) || !absoluto || !p) return next(e)

    const rel = absoluto.startsWith(`${p.raiz}/`) ? absoluto.slice(p.raiz.length + 1) : absoluto
    const atividade: Atividade = EDITAM.has(tool) ? 'editando' : 'lendo'
    await update($, ativos, a => ({ ...a, [rel]: atividade }))
    try {
      const ran = await next(e)
      if (EDITAM.has(tool) && ran.deny === undefined && ran.isError !== true) {
        await update($, tocados, t => (t.includes(rel) ? t : [...t, rel]))
        await update($, projeto, atual =>
          atual && !atual.arquivos.includes(rel) ? { ...atual, arquivos: [...atual.arquivos, rel] } : atual,
        )
        await atualizarGit($)
      }
      return ran
    } finally {
      await update($, ativos, a => Object.fromEntries(Object.entries(a).filter(([k]) => k !== rel)))
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, projeto)
    if (p === null) return <Text dimColor>Carregando arquivos…</Text>

    const at = await read($, ativos)
    const toc = await read($, tocados)
    const abt = await read($, abertas)
    const fch = await read($, fechadas)
    const destaques = [...Object.keys(at), ...Object.keys(p.git), ...toc]
    const arvore = montar(new Set([...p.arquivos, ...destaques]))
    const temDestaque = (dir: string) => destaques.some(c => c.startsWith(`${dir}/`))
    const isAberta = (dir: string) => abt.includes(dir) || (temDestaque(dir) && !fch.includes(dir))

    const alternar = (dir: string, aberta: boolean) => async () => {
      await update($, abertas, l => (aberta ? l.filter(x => x !== dir) : [...l, dir]))
      await update($, fechadas, l => (aberta ? [...l, dir] : l.filter(x => x !== dir)))
    }

    const cor = (c: string) => {
      const ativo = at[c]
      if (ativo) return { color: 'claude', bold: true, inverse: ativo === 'editando', marca: ativo === 'editando' ? '✎' : '◉' }
      const g = p.git[c]
      if (g === 'D') return { color: 'error', strikethrough: true, marca: '−' }
      if (g === '??' || g === 'A') return { color: 'warning', marca: '+' }
      if (g === 'C') return { color: 'suggestion', marca: '↑' }
      if (g) return { color: 'warning', marca: '~' }
      if (toc.includes(c)) return { color: 'success', marca: '✓' }
      return { dimColor: true, marca: ' ' }
    }

    const saida: unknown[] = []
    const visitar = (no: No, nivel: number) => {
      for (const filho of ordenar(no)) {
        if (saida.length >= LIMITE_LINHAS) return
        const recuo = '  '.repeat(nivel)
        if (filho.isDir) {
          const aberta = isAberta(filho.caminho)
          saida.push(
            <Box key={`d:${filho.caminho}`}>
              <Text>{recuo}</Text>
              <Button
                key={`b:${filho.caminho}`}
                plain
                label={`${aberta ? '▾' : '▸'} ${filho.nome}/`}
                onPress={alternar(filho.caminho, aberta)}
              />
              {!aberta && temDestaque(filho.caminho) && <Text color="warning"> •</Text>}
            </Box>,
          )
          if (aberta) visitar(filho, nivel + 1)
        } else {
          const { marca, ...estilo } = cor(filho.caminho)
          saida.push(
            <Text key={`f:${filho.caminho}`} wrap="truncate-end" {...estilo}>
              {recuo}
              {marca} {filho.nome}
            </Text>,
          )
        }
      }
    }
    visitar(arvore, 0)

    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          ✎ editando ◉ lendo ~ alterado + novo ↑ commitado ✓ enviado
        </Text>
        {saida as never}
        {saida.length >= LIMITE_LINHAS && <Text dimColor>… lista cortada em {LIMITE_LINHAS} linhas</Text>}
      </Box>
    )
  })
}
