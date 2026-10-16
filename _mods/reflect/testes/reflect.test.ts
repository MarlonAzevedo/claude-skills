import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { GATILHOS, inserir } from '../hooks/register'

const BAND = {
  plugin: 'reflect',
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}

const digitar = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

// Sistema de arquivos em memória e um modelo que devolve sempre a mesma regra.
const ambiente = (on: On, arquivos: Record<string, string>) => {
  on('session.root', () => ({ value: '/proj' }))
  on('env.get', () => ({ value: '/home/eu' }))
  on('fs.exists', (_$, e) => ({ value: e.path in arquivos }))
  on('fs.read', (_$, e) => ({ value: arquivos[e.path] ?? '' }))
  on('fs.write', (_$, e) => {
    arquivos[e.path] = e.text
    return { value: undefined }
  })
  on('model.fork', () => ({
    value: { isAnswered: true, text: '- Sempre rodar os testes antes de dizer que terminou.', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  }) as never)
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  // O que o motor desenharia abaixo da faixa: nada.
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
}

test('gatilhos reconhecem reclamações e ignoram pedidos normais', () => {
  expect(GATILHOS.test('não gostei disso')).toBe(true)
  expect(GATILHOS.test('Isso não ficou bom, refaz')).toBe(true)
  expect(GATILHOS.test('já te falei pra não usar var')).toBe(true)
  expect(GATILHOS.test('queria que tivéssemos feito de outra forma')).toBe(true)
  expect(GATILHOS.test('cria um teste para o login')).toBe(false)
  expect(GATILHOS.test('paradeiro do arquivo')).toBe(false)
})

test('inserir cria a seção e mantém LF e o final do arquivo', () => {
  expect(inserir('# Projeto\n', 'Regra A')).toBe('# Projeto\n\n## Aprendizados (Reflect)\n\n- Regra A\n')
  expect(inserir('# Projeto', 'Regra A')).toBe('# Projeto\n\n## Aprendizados (Reflect)\n\n- Regra A')
  const crlf = inserir('# P\r\n\r\n## Aprendizados (Reflect)\r\n\r\n- A\r\n\r\n## Outra\r\n', 'B')
  expect(crlf).toBe('# P\r\n\r\n## Aprendizados (Reflect)\r\n\r\n- A\r\n- B\r\n\r\n## Outra\r\n')
})

test('feedback vira regra no CLAUDE.md do projeto com um clique', async ($, on) => {
  const arquivos: Record<string, string> = { '/proj/CLAUDE.md': '# Projeto\n' }
  ambiente(on, arquivos)
  await $.prompt.submit(digitar('não gostei, você não rodou os testes'))

  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'projeto' })
  expect(arquivos['/proj/CLAUDE.md']).toBe(
    '# Projeto\n\n## Aprendizados (Reflect)\n\n- Sempre rodar os testes antes de dizer que terminou.\n',
  )
})

test('global grava no ~/.claude/CLAUDE.md e ignorar não grava nada', async ($, on) => {
  const arquivos: Record<string, string> = {}
  ambiente(on, arquivos)
  await $.prompt.submit(digitar('isso tá errado'))
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'ignorar' })
  expect(Object.keys(arquivos)).toEqual([])

  await $.prompt.submit(digitar('isso tá errado de novo'))
  const ui2 = await $.ui.mount(BAND)
  await ui2.press({ key: 'global' })
  expect(Object.keys(arquivos)).toEqual(['/home/eu/.claude/CLAUDE.md'])
})
