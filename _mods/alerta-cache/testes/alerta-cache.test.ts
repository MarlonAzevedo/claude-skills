import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const MINUTO = 60_000
const OPCOES = { options: { ttlMinutos: 5, minimoTokens: 30000 } }

// Sessão de mentira: contexto de 80k tokens, caixa do prompt e envio que só devolve o texto.
const ambiente = (on: On, tokens = 80_000) => {
  const clock = mock.clock(on)
  const enviados: string[] = []
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens, window: 200_000 }, rateLimits: [] } }))
  on('prompt.fill', (_$, e) => ({ value: { text: e.text } }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => {
    enviados.push(e.text)
    return { text: e.text }
  })
  return { clock, enviados }
}

const digitar = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })
const fimDeTurno = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' as const }

test('dentro da validade o prompt passa', OPCOES, async ($, on) => {
  const { clock, enviados } = ambiente(on)
  await $.turn.complete(fimDeTurno)
  await clock.advance(2 * MINUTO)
  const r = await $.prompt.submit(digitar('oi'))
  expect(r.drop).toBeUndefined()
  expect(enviados).toEqual(['oi'])
})

test('cache expirado segura o prompt e o segundo Enter confirma', OPCOES, async ($, on) => {
  const { clock, enviados } = ambiente(on)
  await $.turn.complete(fimDeTurno)
  await clock.advance(6 * MINUTO)

  const r = await $.prompt.submit(digitar('continua'))
  expect(r.drop).toContain('Cache expirado há 6 min')
  expect(r.drop).toContain('80k')
  expect(enviados).toEqual([])

  const r2 = await $.prompt.submit(digitar('continua'))
  expect(r2.drop).toBeUndefined()
  expect(enviados).toEqual(['continua'])
})

test('conversa pequena não gera aviso', OPCOES, async ($, on) => {
  const { clock } = ambiente(on, 5_000)
  await $.turn.complete(fimDeTurno)
  await clock.advance(30 * MINUTO)
  expect((await $.prompt.submit(digitar('oi'))).drop).toBeUndefined()
})
