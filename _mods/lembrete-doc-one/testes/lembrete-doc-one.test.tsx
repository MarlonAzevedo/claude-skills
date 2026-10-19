import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { lerMapa, projetoDe } from '../hooks/register'

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
  on('fs.read', () => ({ value: README }))
  on('fs.exists', () => ({ value: false }))
  on('env.get', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: { filePath: 'x' } }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return 'hint' in e.props ? <Text>{e.props.hint}</Text> : <Box key="engine" />
  })
}

const edit = (file_path: string) => ({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' }) as never
const fimDeTurno = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' as const }
const dica = ($: Engine) =>
  $.ui.mount({ plugin: 'lembrete-doc-one', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } })
const faixa = ($: Engine) =>
  $.ui.mount({
    plugin: 'lembrete-doc-one', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })

test('lê o mapa da tabela Projetos e acha o projeto pelo caminho mais longo', () => {
  const mapa = lerMapa(README)
  expect(projetoDe('/srv/htdocs/sistema/API/src/a.js', mapa)).toEqual({ projeto: 'Api', pastaDoc: 'api' })
  expect(projetoDe('/srv/htdocs/portal-front/src/b.tsx', mapa)).toEqual({ projeto: 'portal-front', pastaDoc: 'portal' })
  expect(projetoDe('/srv/htdocs/sistema/adm/c.php', mapa)).toEqual({ projeto: 'sistema', pastaDoc: null })
  expect(projetoDe('/home/eu/outro/d.ts', mapa)).toBeNull()
})

test('código alterado em htdocs aparece discreto na linha de dicas, sem faixa nem botão', OPCOES, async ($, on) => {
  ambiente(on)
  await $.tool.call(edit('/srv/htdocs/sistema/API/src/a.js'))
  await $.tool.call(edit('/srv/htdocs/sistema/API/src/b.js'))
  await $.turn.complete(fimDeTurno)

  const ui = await dica($)
  expect(await ui.find({ type: 'Text', text: '? for shortcuts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /doc ONE pendente: Api \(2\)/ })).toBeDefined()

  const acima = await faixa($)
  expect(await acima.find({ type: 'Text', text: /doc ONE/ })).toBeUndefined()
  expect(await acima.find({ type: 'Button' })).toBeUndefined()
})

test('editar a pasta do projeto na documentação tira o aviso', OPCOES, async ($, on) => {
  ambiente(on)
  await $.tool.call(edit('/srv/htdocs/sistema/painel/src/App.tsx'))
  await $.tool.call(edit(`${DOC}/painel/painel-00-indice.md`))
  await $.turn.complete(fimDeTurno)

  const ui = await dica($)
  expect(await ui.find({ type: 'Text', text: /doc ONE/ })).toBeUndefined()
})

test('arquivo fora de htdocs não gera aviso', OPCOES, async ($, on) => {
  ambiente(on)
  await $.tool.call(edit('/home/eu/projeto/a.ts'))
  await $.turn.complete(fimDeTurno)
  const ui = await dica($)
  expect(await ui.find({ type: 'Text', text: /doc ONE/ })).toBeUndefined()
})
