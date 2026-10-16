import { expect, test } from 'claude-code/testing'

import { BAND, COLUNA, filhosDaColuna } from './faixas'

test('a sugestão entra na coluna de faixas dos outros mods em vez de embrulhá-la', async ($, on) => {
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.render', () => COLUNA as never)
  await $.prompt.submit({ text: 'não gostei disso', wait: false, origin: { kind: 'composer' } })

  const ui = await $.ui.mount({ ...BAND, plugin: 'reflect' })
  expect(await filhosDaColuna(ui)).toEqual(['band:reflect', 'band:usage-meter'])
})
