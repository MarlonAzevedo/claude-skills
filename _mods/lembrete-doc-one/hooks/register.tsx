// Lembrete da documentação da ONE: código alterado em htdocs pede nota atualizada na documentacao-one.
//   Anota cada arquivo que o Edit/Write muda dentro de htdocs, por projeto (mapa lido da tabela
//   "Projetos" do README.md da documentação), e no fim do turno mostra uma faixa com o que falta
//   documentar. Editar a pasta do projeto na documentação tira o projeto da lista.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pendente } from '../types'
import { bandsFile, parseOrder, stackBands } from './bands'

const pendentes = atom({ plugin: 'lembrete-doc-one', key: 'pendentes' } as const, [] as Pendente[])
const visivel = atom({ plugin: 'lembrete-doc-one', key: 'visivel' } as const, false)

export type Mapa = { codigo: string; pastaDoc: string }[]

// Linhas da tabela "Projetos": | Projeto | [`api/`](...) | `htdocs/sistema/api` | ... |
export const lerMapa = (readme: string): Mapa => {
  const secao = readme.split(/^## /m).find(s => s.startsWith('Projetos')) ?? ''
  const mapa: Mapa = []
  for (const linha of secao.split('\n')) {
    const colunas = linha.split('|').map(c => c.trim())
    const pasta = colunas[2]?.match(/`([^`]+?)\/?`/)?.[1]
    const codigos = [...(colunas[3] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]!.replace(/^htdocs\//, '').replace(/\/$/, ''))
    if (pasta) for (const codigo of codigos) mapa.push({ codigo, pastaDoc: pasta })
  }
  return mapa.sort((a, b) => b.codigo.length - a.codigo.length)
}

// Projeto de um arquivo em htdocs: o código mais longo do mapa que o contém, senão a primeira pasta.
export const projetoDe = (caminho: string, mapa: Mapa): { projeto: string; pastaDoc: string | null } | null => {
  const m = caminho.match(/\/htdocs\/(.+)$/)
  if (!m) return null
  const rel = m[1]!
  const achado = mapa.find(p => rel.toLowerCase().startsWith(`${p.codigo.toLowerCase()}/`))
  if (achado) return { projeto: achado.codigo.split('/').pop()!, pastaDoc: achado.pastaDoc }
  return { projeto: rel.split('/')[0]!, pastaDoc: null }
}

let mapaCache: Promise<Mapa> | undefined
const mapaDe = ($: EngineInterface, pastaDoc: string) =>
  (mapaCache ??= $.fs.read(`${pastaDoc}/README.md`).then(lerMapa).catch(() => []))

let ordem: Promise<string[]> | undefined
const ordemFaixas = ($: EngineInterface) => (ordem ??= lerOrdem($).catch(() => []))

async function lerOrdem($: EngineInterface): Promise<string[]> {
  const arquivo = bandsFile(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME'))
  return arquivo && (await $.fs.exists(arquivo)) ? parseOrder(await $.fs.read(arquivo)) : []
}

export const register: Register = (on, options) => {
  const pastaDoc = String(options.pastaDocumentacao ?? '').replace(/\/+$/, '')

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const tool = String(e.tool)
    const caminho = (e as unknown as { file_path?: string }).file_path
    if (!['Edit', 'Write', 'MultiEdit'].includes(tool) || !caminho || ran.deny !== undefined || ran.isError === true) return ran

    if (pastaDoc && caminho.startsWith(`${pastaDoc}/`)) {
      // Nota editada na pasta de um projeto: esse projeto está documentado.
      const pasta = caminho.slice(pastaDoc.length + 1).split('/')[0]
      await update($, pendentes, l => l.filter(p => p.pastaDoc !== pasta))
      return ran
    }

    const alvo = projetoDe(caminho, await mapaDe($, pastaDoc))
    if (!alvo) return ran
    await update($, pendentes, l => {
      const atual = l.find(p => p.projeto === alvo.projeto)
      if (!atual) return [...l, { ...alvo, arquivos: [caminho] }]
      return l.map(p => (p === atual && !p.arquivos.includes(caminho) ? { ...p, arquivos: [...p.arquivos, caminho] } : p))
    })
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && (await read($, pendentes)).length > 0) await update($, visivel, () => true)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const lista = await read($, pendentes)
    if (e.props.hasSurvey || e.props.isWorking || lista.length === 0 || !(await read($, visivel))) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const abaixo = await next(e)
    const resumo = lista.map(p => `${p.projeto} (${p.arquivos.length})`).join(', ')
    const pedido =
      `Atualize a documentação da ONE em ${pastaDoc} para as mudanças desta sessão em: ` +
      lista.map(p => `${p.projeto} → ${p.pastaDoc ? `${p.pastaDoc}/` : 'sem pasta na documentação ainda'} (${p.arquivos.join(', ')})`).join('; ') +
      '. Siga o AGENTS.md de lá: git pull antes de editar, registro de mudanças, links [[...]] válidos e commit no repositório da documentação, sem push.'

    const mine = (
      <Box>
        <Text color="suggestion">📘 Documentação da ONE pendente: {resumo} </Text>
        <Button
          key="atualizar"
          variant="primary"
          label="Atualizar"
          onPress={async () => {
            await update($, visivel, () => false)
            await $.prompt.submit({ text: pedido, asUser: true })
          }}
        />
        <Text> </Text>
        <Button
          key="ok"
          role="dismiss"
          label="Já está ok"
          onPress={async () => {
            await update($, pendentes, () => [])
            await update($, visivel, () => false)
          }}
        />
      </Box>
    )
    return stackBands(abaixo, 'lembrete-doc-one', mine, 'above', await ordemFaixas($))
  })
}
