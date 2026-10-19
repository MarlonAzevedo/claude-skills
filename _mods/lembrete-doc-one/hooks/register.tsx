// Lembrete da documentação da ONE: código alterado em htdocs pede nota atualizada na documentacao-one.
//   Anota cada arquivo que o Edit/Write muda dentro de htdocs, por projeto (mapa lido da tabela
//   "Projetos" do README.md da documentação), e mostra o que falta documentar na linha de dicas,
//   sem interromper. Editar a pasta do projeto na documentação tira o projeto da lista.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pendente } from '../types'

const pendentes = atom({ plugin: 'lembrete-doc-one', key: 'pendentes' } as const, [] as Pendente[])

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

// Pastas que fazem o papel do htdocs fora do Windows, a mais longa primeiro: "/a/, /b/"
export const lerRaizes = (texto: string): string[] =>
  texto.split(',').map(r => r.trim()).filter(Boolean).map(r => `/${r.replace(/^\/+|\/+$/g, '')}/`).sort((a, b) => b.length - a.length)

// Pasta local com nome diferente do htdocs: "onePlus=wsOnePortaria/Plus"
export const lerApelidos = (texto: string): Record<string, string> =>
  Object.fromEntries(texto.split(',').map(a => a.split('=').map(s => s.trim())).filter(a => a.length === 2 && a[0] && a[1]))

type Locais = { raizes: string[]; apelidos: Record<string, string> }

// Projeto de um arquivo: o código mais longo do mapa que o contém. Em htdocs, sem achado, vale a
// primeira pasta; nas outras raízes, só conta o que está na tabela (o resto é do ambiente docker).
export const projetoDe = (caminho: string, mapa: Mapa, locais: Locais = { raizes: [], apelidos: {} }): { projeto: string; pastaDoc: string | null } | null => {
  let rel: string | undefined
  let emHtdocs = false
  const m = caminho.match(/\/htdocs\/(.+)$/)
  if (m) [rel, emHtdocs] = [m[1]!, true]
  else {
    const raiz = locais.raizes.find(r => caminho.includes(r))
    if (raiz) rel = caminho.slice(caminho.indexOf(raiz) + raiz.length)
  }
  if (!rel || !rel.includes('/')) return null
  const [primeira, ...resto] = rel.split('/')
  const apelido = Object.entries(locais.apelidos).find(([de]) => de.toLowerCase() === primeira!.toLowerCase())?.[1]
  if (apelido) rel = [apelido, ...resto].join('/')
  const achado = mapa.find(p => rel!.toLowerCase().startsWith(`${p.codigo.toLowerCase()}/`))
  if (achado) return { projeto: achado.codigo.split('/').pop()!, pastaDoc: achado.pastaDoc }
  return emHtdocs ? { projeto: primeira!, pastaDoc: null } : null
}

let mapaCache: Promise<Mapa> | undefined
const mapaDe = ($: EngineInterface, pastaDoc: string) =>
  (mapaCache ??= $.fs.read(`${pastaDoc}/README.md`).then(lerMapa).catch(() => []))

export const register: Register = (on, options) => {
  const pastaDoc = String(options.pastaDocumentacao ?? '').replace(/\/+$/, '')
  const locais = { raizes: lerRaizes(String(options.pastasCodigo ?? '')), apelidos: lerApelidos(String(options.apelidos ?? '')) }

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

    const alvo = projetoDe(caminho, await mapaDe($, pastaDoc), locais)
    if (!alvo) return ran
    await update($, pendentes, l => {
      const atual = l.find(p => p.projeto === alvo.projeto)
      if (!atual) return [...l, { ...alvo, arquivos: [caminho] }]
      return l.map(p => (p === atual && !p.arquivos.includes(caminho) ? { ...p, arquivos: [...p.arquivos, caminho] } : p))
    })
    return ran
  }).catch(($, e, next) => next(e))

  // Aviso discreto e fixo: a documentação é escrita no fim da sessão ou quando a pessoa pedir.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const lista = await read($, pendentes)
    if (lista.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const resumo = lista.map(p => `${p.projeto} (${p.arquivos.length})`).join(', ')
    return (
      <Box flexDirection="row">
        {await next(e)}
        <Text dimColor> · 📘 doc ONE pendente: {resumo}</Text>
      </Box>
    )
  })
}
