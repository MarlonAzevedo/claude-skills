import { expect, mock, test } from 'claude-code/testing'

import { BAND, COLUNA, filhosDaColuna } from './faixas'

test('a faixa entra na coluna de faixas dos outros mods em vez de embrulhá-la', async ($, on) => {
  mock.clock(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }) as never)
  on('tool.call', () => ({ result: { oldTodos: [], newTodos: [] } }) as never)
  on('ui.render', () => COLUNA as never)
  await $.turn.start({ text: 'faz', turnId: 't1' })
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Ler', status: 'in_progress', activeForm: 'Lendo' }] } as never)

  const ui = await $.ui.mount({ ...BAND, plugin: 'progresso-agentes' })
  expect(await filhosDaColuna(ui)).toEqual(['band:progresso-agentes', 'band:usage-meter'])
})
