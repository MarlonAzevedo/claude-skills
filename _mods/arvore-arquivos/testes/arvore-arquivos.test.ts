import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { statusGit } from '../hooks/register'

const PANE = {
  plugin: 'arvore-arquivos',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: 'arvore',
  props: { title: 'Arquivos', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
}

// Repositório git de mentira: o status muda depois que o Edit roda.
const ambiente = (on: On) => {
  let status = ''
  const saida = (argv: readonly string[]) => {
    const cmd = argv.join(' ')
    if (cmd.includes('rev-parse')) return '/proj\n'
    if (cmd.includes('ls-files')) return 'README.md\nsrc/app.ts\nsrc/util/data.ts\n'
    if (cmd.includes('status')) return status
    return ''
  }
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', (_$, e) => ({ value: { exitCode: 0, stdout: saida(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ text: '' }))
  on('tool.call', () => {
    status = ' M src/app.ts\n?? src/novo.ts\n'
    return { result: { filePath: '/proj/src/app.ts' } } as never
  })
}

test('statusGit lê o porcelain', () => {
  expect(statusGit(' M a.ts\nM  b.ts\n?? c.ts\nR  d.ts -> e.ts\n D f.ts\n')).toEqual({ 'a.ts': 'M', 'b.ts': 'M', 'c.ts': '??', 'e.ts': 'R', 'f.ts': 'D' })
})

test('mostra a árvore, abre a pasta do arquivo editado e marca o estado', async ($, on) => {
  ambiente(on)
  await $.command.run({ command: 'arvore', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as never)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /README\.md/ })).toBeDefined()
  // pasta sem destaque começa fechada
  expect(await ui.find({ type: 'Text', text: /app\.ts/ })).toBeUndefined()

  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/app.ts', old_string: 'a', new_string: 'b' } as never)
  expect(await ui.find({ type: 'Text', text: /~ app\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\+ novo\.ts/ })).toBeDefined()

  // fechar a pasta à mão vence o destaque
  await ui.press({ key: 'b:src' })
  expect(await ui.find({ type: 'Text', text: /app\.ts/ })).toBeUndefined()
})
