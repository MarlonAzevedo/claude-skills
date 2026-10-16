import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { bandsFile, parseOrder, stackBands } from './bands'

const sugestao = atom({ plugin: 'reflect', key: 'sugestao' } as const, null)

const SECAO = '## Aprendizados (Reflect)'

export const GATILHOS =
  /(^|[^\p{L}])(n[ãa]o gostei|n[ãa]o ficou bom|n[ãa]o era (isso|assim)|n[ãa]o [ée] (isso|assim)|(t[áa]|est[áa]|ficou) errad[oa]|queria que|preferia que|n[ãa]o fa[çc]a|nunca (mais )?fa[çc]a|pare de|para de|j[áa] (te )?(falei|disse|pedi)|de novo isso|eu (te )?disse|i don'?t like|that'?s (wrong|not right)|not what i (asked|wanted)|stop doing|don'?t do that)/iu

// Insere a regra na seção do Reflect, criando a seção se faltar; mantém CRLF/LF e o final do arquivo.
export const inserir = (texto: string, regra: string) => {
  const nl = texto.includes('\r\n') ? '\r\n' : '\n'
  const linha = `- ${regra}`
  const terminaComQuebra = texto === '' || texto.endsWith(nl)
  const corpo = terminaComQuebra ? texto.slice(0, texto.length - (texto === '' ? 0 : nl.length)) : texto
  const linhas = corpo === '' ? [] : corpo.split(nl)
  const inicio = linhas.findIndex(l => l.trim() === SECAO)
  if (inicio === -1) {
    const novo = [...linhas, ...(linhas.length ? [''] : []), SECAO, '', linha]
    return novo.join(nl) + (terminaComQuebra ? nl : '')
  }
  let fim = linhas.findIndex((l, i) => i > inicio && /^#{1,2} /.test(l))
  if (fim === -1) fim = linhas.length
  while (fim > inicio + 1 && (linhas[fim - 1] ?? '').trim() === '') fim -= 1
  linhas.splice(fim, 0, linha)
  return linhas.join(nl) + (terminaComQuebra ? nl : '')
}

const arquivoDoProjeto = async ($: EngineInterface) => {
  const raiz = await $.session.root()
  for (const nome of ['CLAUDE.md', 'AGENTS.md']) {
    if (await $.fs.exists(`${raiz}/${nome}`)) return `${raiz}/${nome}`
  }
  return `${raiz}/CLAUDE.md`
}

const salvar = async ($: EngineInterface, feedback: string, onde: 'projeto' | 'global') => {
  await update($, sugestao, s => s && { ...s, salvando: true })
  try {
    await escrever($, feedback, onde)
  } catch (erro) {
    await update($, sugestao, s => s && { ...s, salvando: false })
    $.ui.toast(`Reflect: não consegui salvar a regra (${String(erro)})`)
  }
}

const escrever = async ($: EngineInterface, feedback: string, onde: 'projeto' | 'global') => {
  const pedido =
    `A pessoa acabou de dar este feedback sobre o seu trabalho: "${feedback}". ` +
    'Escreva UMA regra curta, imperativa e geral, em português do Brasil, para o CLAUDE.md, ' +
    'que evite repetir esse erro nas próximas sessões. Responda só com a regra, numa linha, sem marcador nem aspas.'
  const r = await $.model.fork({ prompt: pedido })
  const regra = (r.isAnswered ? r.text : feedback).trim().split('\n')[0]?.replace(/^[-*]\s*/, '') ?? feedback

  const caminho = onde === 'global' ? `${(await $.env.get('HOME')) ?? '~'}/.claude/CLAUDE.md` : await arquivoDoProjeto($)
  const atual = (await $.fs.exists(caminho)) ? await $.fs.read(caminho) : ''
  await $.fs.write(caminho, inserir(atual, regra))
  await update($, sugestao, () => null)
  $.ui.toast(`Regra salva em ${caminho}: ${regra}`)
}

// Ordem das faixas salva pelo checklist do claude-code-mods; lida uma vez por sessão.
let ordem: Promise<string[]> | undefined
const ordemFaixas = ($: EngineInterface) => (ordem ??= lerOrdem($).catch(() => []))

async function lerOrdem($: EngineInterface): Promise<string[]> {
  const arquivo = bandsFile(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME'))
  return arquivo && (await $.fs.exists(arquivo)) ? parseOrder(await $.fs.read(arquivo)) : []
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && !e.command && GATILHOS.test(e.text)) {
      await update($, sugestao, () => ({ feedback: e.text.slice(0, 1000), salvando: false }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, sugestao)
    if (s === null || e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const abaixo = await next(e)

    const mine = (
      <Box flexDirection="column">
        {s.salvando ? (
          <Text dimColor>Reflect: escrevendo a regra…</Text>
        ) : (
          <Box>
            <Text color="suggestion">Salvar esse feedback como regra? </Text>
            <Button key="projeto" variant="primary" label="CLAUDE.md do projeto" onPress={() => salvar($, s.feedback, 'projeto')} />
            <Text> </Text>
            <Button key="global" label="Global" onPress={() => salvar($, s.feedback, 'global')} />
            <Text> </Text>
            <Button key="ignorar" role="dismiss" label="Ignorar" onPress={() => update($, sugestao, () => null)} />
          </Box>
        )}
      </Box>
    )
    return stackBands(abaixo, 'reflect', mine, 'above', await ordemFaixas($))
  })
}
