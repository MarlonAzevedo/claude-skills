import { expect, mock, test } from 'claude-code/testing'

import { BAND, COLUNA, filhosDaColuna } from './faixas'

test('o aviso entra na coluna de faixas dos outros mods em vez de embrulhá-la', { options: { ttlMinutos: 5, minimoTokens: 1000 } }, async ($, on) => {
  const clock = mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 50_000, window: 200_000 }, rateLimits: [] } }))
  on('prompt.fill', (_$, e) => ({ value: { text: e.text } }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.render', () => COLUNA as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(10 * 60_000)
  await $.prompt.submit({ text: 'oi', wait: false, origin: { kind: 'composer' } })

  const ui = await $.ui.mount({ ...BAND, plugin: 'alerta-cache' })
  expect(await filhosDaColuna(ui)).toEqual(['band:alerta-cache', 'band:usage-meter'])
})
