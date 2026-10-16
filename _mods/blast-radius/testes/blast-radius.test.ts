import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const bash = (command: string) => ({ tool: 'Bash' as const, command, description: 'teste' })

const PANE = {
  plugin: 'blast-radius',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: 'blast-radius',
  props: { title: 'Blast Radius', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
}

// O kit não tem sessão, processos nem terminal: o teste responde por eles e conta as execuções.
const ambiente = (on: On) => {
  const rodou: string[] = []
  on('session.cwd', () => ({ value: '/projeto' }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'build/  (12 arquivos, 4,0M)\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('tool.call', (_$, e) => {
    rodou.push(String((e as { command?: string }).command))
    return { result: { stdout: '', stderr: '', interrupted: false } } as never
  })
  return rodou
}

test('comando seguro passa direto', async ($, on) => {
  const rodou = ambiente(on)
  const r = await $.tool.call(bash('ls -la'))
  expect(r.deny).toBeUndefined()
  expect(rodou).toEqual(['ls -la'])
})

test('rm -rf é retido, mostra o impacto e só passa uma vez depois do clique', async ($, on) => {
  const rodou = ambiente(on)
  const r = await $.tool.call(bash('rm -rf build'))
  expect(r.deny).toContain('Blast Radius')
  expect(rodou).toEqual([])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /12 arquivos/ })).toBeDefined()
  await ui.press({ key: 'prosseguir' })

  expect((await $.tool.call(bash('rm -rf build'))).deny).toBeUndefined()
  expect(rodou).toEqual(['rm -rf build'])
  expect((await $.tool.call(bash('rm -rf build'))).deny).toContain('Blast Radius')
})

test('cancelar não libera o comando', async ($, on) => {
  const rodou = ambiente(on)
  await $.tool.call(bash('git clean -fdx'))
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'cancelar' })
  expect((await $.tool.call(bash('git clean -fdx'))).deny).toBeDefined()
  expect(rodou).toEqual([])
})

test('git reset --hard e push --force são retidos', async ($, on) => {
  ambiente(on)
  expect((await $.tool.call(bash('git reset --hard HEAD~1'))).deny).toBeDefined()
  expect((await $.tool.call(bash('git push --force origin main'))).deny).toBeDefined()
  expect((await $.tool.call(bash('git status'))).deny).toBeUndefined()
})
