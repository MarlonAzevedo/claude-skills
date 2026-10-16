import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { lerMapa, projetoDe } from '../hooks/register'
import { BAND, COLUNA, filhosDaColuna } from './faixas'

const DOC = '/doc/documentacao-one'
const README = `# Documentação

## Projetos

| Projeto | Pasta | Código | Início |
| --- | --- | --- | --- |
| **API** | [\`api/\`](api/00-indice.md) | \`htdocs/sistema/Api\` | [[00-indice]] |
| **Painel** | [\`painel/\`](painel/painel-00-indice.md) | \`htdocs/sistema/painel\` | [[painel-00-indice]] |
| **Portal** | [\`portal/\`](a.md) | \`htdocs/portal-back\`, \`htdocs/portal-front\` | [[x]] |
| _(próximos: sistema PHP…)_ | | | |

## Sprints
`
const OPCOES = { options: { pastaDocumentacao: DOC } }

const ambiente = (on: On) => {
  const enviados: string[] = []
  on('fs.read', () => ({ value: README }))
  on('fs.exists', () => ({ value: false }))
  on('env.get', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: { filePath: 'x' } }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => {
    enviados.push(e.text)
    return { text: e.text }
  })
  on('ui.render', () => COLUNA as never)
  return enviados
}

const edit = (file_path: string) => ({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' }) as never
const fimDeTurno = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' as const }

test('lê o mapa da tabela Projetos e acha o projeto pelo caminho mais longo', () => {
  const mapa = lerMapa(README)
  expect(projetoDe('/srv/htdocs/sistema/API/src/a.js', mapa)).toEqual({ projeto: 'Api', pastaDoc: 'api' })
  expect(projetoDe('/srv/htdocs/portal-front/src/b.tsx', mapa)).toEqual({ projeto: 'portal-front', pastaDoc: 'portal' })
  expect(projetoDe('/srv/htdocs/sistema/adm/c.php', mapa)).toEqual({ projeto: 'sistema', pastaDoc: null })
  expect(projetoDe('/home/eu/outro/d.ts', mapa)).toBeNull()
})

test('código alterado em htdocs vira faixa no fim do turno, e o botão pede a atualização', OPCOES, async ($, on) => {
  const enviados = ambiente(on)
  await $.tool.call(edit('/srv/htdocs/sistema/API/src/a.js'))
  await $.tool.call(edit('/srv/htdocs/sistema/API/src/b.js'))
  await $.turn.complete(fimDeTurno)

  const ui = await $.ui.mount({ ...BAND, plugin: 'lembrete-doc-one', props: { ...BAND.props, isWorking: false } })
  expect(await ui.find({ type: 'Text', text: /Api \(2\)/ })).toBeDefined()
  expect(await filhosDaColuna(ui)).toEqual(['band:lembrete-doc-one', 'band:usage-meter'])

  await ui.press({ key: 'atualizar' })
  expect(enviados[0]).toContain(`${DOC}`)
  expect(enviados[0]).toContain('api/')
  expect(enviados[0]).toContain('git pull')
})

test('editar a pasta do projeto na documentação tira o lembrete', OPCOES, async ($, on) => {
  ambiente(on)
  await $.tool.call(edit('/srv/htdocs/sistema/painel/src/App.tsx'))
  await $.tool.call(edit(`${DOC}/painel/painel-00-indice.md`))
  await $.turn.complete(fimDeTurno)

  const ui = await $.ui.mount({ ...BAND, plugin: 'lembrete-doc-one', props: { ...BAND.props, isWorking: false } })
  expect(await ui.find({ type: 'Text', text: /Documentação da ONE/ })).toBeUndefined()
})

test('arquivo fora de htdocs não gera lembrete', OPCOES, async ($, on) => {
  ambiente(on)
  await $.tool.call(edit('/home/eu/projeto/a.ts'))
  await $.turn.complete(fimDeTurno)
  const ui = await $.ui.mount({ ...BAND, plugin: 'lembrete-doc-one', props: { ...BAND.props, isWorking: false } })
  expect(await ui.find({ type: 'Text', text: /Documentação da ONE/ })).toBeUndefined()
})
