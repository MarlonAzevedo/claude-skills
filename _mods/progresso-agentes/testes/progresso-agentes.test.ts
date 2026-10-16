import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'progresso-agentes',
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}

const ambiente = (on: On) => {
  mock.clock(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'Revisar o login', type: 'Explore', status: 'running' }] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', () => ({ result: { oldTodos: [], newTodos: [] } }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
}

test('barra de progresso acompanha o TodoWrite', async ($, on) => {
  ambiente(on)
  await $.turn.start({ text: 'faz', turnId: 't1' })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Ler', status: 'completed', activeForm: 'Lendo' },
      { content: 'Escrever', status: 'in_progress', activeForm: 'Escrevendo' },
      { content: 'Testar', status: 'pending', activeForm: 'Testando' },
    ],
  } as never)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: '1/3 ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Escrever/ })).toBeDefined()
})

test('subagente aparece na faixa e no painel', async ($, on) => {
  ambiente(on)
  await $.turn.start({ text: 'faz', turnId: 't1' })
  await $.turn.start({ text: 'revisa', turnId: 't2', agentId: 'a1' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /1 subagente rodando/ })).toBeDefined()

  const pane = await $.ui.mount({
    plugin: 'progresso-agentes',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'subagentes',
    props: { title: 'Subagentes', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  expect(await pane.find({ type: 'Text', text: 'Revisar o login' })).toBeDefined()

  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't2', agentId: 'a1', reason: 'answer' })
  expect(await pane.find({ type: 'Text', text: '✓ ' })).toBeDefined()
})
