import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { deBase64, ehUtf8, para1252, paraBase64, perfil } from '../hooks/register'

const utf8 = (s: string) => new TextEncoder().encode(s)
const cp1252 = (s: string) => {
  const r = para1252(s)
  if ('falta' in r) throw new Error(`sem ${r.falta}`)
  return r.bytes
}
const iguais = (a: Uint8Array | undefined, b: Uint8Array) => expect(a ? Array.from(a) : a).toEqual(Array.from(b))

// Disco em memória. O Edit/Write "de verdade" faz o que já se viu acontecer:
// lê como UTF-8 (acentos do Windows-1252 viram U+FFFD) e grava UTF-8 com LF e sem BOM.
const disco = (on: On, arquivos: Record<string, Uint8Array>) => {
  const rodou: string[] = []
  on('fs.read', (_$, e) => {
    const b = arquivos[e.path]
    if (!b) return { deny: 'não existe' }
    return { value: (e as { as?: string }).as === 'bytes' ? { base64: paraBase64(b) } : new TextDecoder().decode(b) } as never
  })
  on('fs.write', (_$, e) => {
    arquivos[e.path] = utf8(e.text)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    const destino = e.argv[e.argv.length - 1]!
    arquivos[destino] = deBase64(e.init?.stdin ?? '')
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('fs.exists', (_$, e) => ({ value: e.path in arquivos }))
  on('tool.call', (_$, e) => {
    const a = e as unknown as { tool: string; file_path: string; old_string?: string; new_string?: string; content?: string }
    rodou.push(a.tool)
    const atual = new TextDecoder().decode(arquivos[a.file_path] ?? new Uint8Array()).replace(/^﻿/, '').replace(/\r\n/g, '\n')
    if (a.tool === 'Read') {
      return { result: { type: 'text', file: { filePath: a.file_path, content: atual.replace(/\n$/, ''), numLines: atual.split('\n').length - 1, startLine: 1, totalLines: 3 } } } as never
    }
    const novo = a.tool === 'Write' ? (a.content ?? '') : atual.replace(a.old_string ?? '', a.new_string ?? '')
    arquivos[a.file_path] = utf8(novo)
    return { result: { filePath: a.file_path } } as never
  })
  return rodou
}

const edit = (file_path: string, old_string: string, new_string: string) => ({ tool: 'Edit', file_path, old_string, new_string }) as never

test('detecta UTF-8 e Windows-1252 pelo teste de UTF-8 estrito', () => {
  expect(ehUtf8(utf8('Ação “ok”'))).toBe(true)
  expect(ehUtf8(cp1252('Ação'))).toBe(false)
  expect(perfil(cp1252('<?php\r\n“x”\r\n'))).toEqual({ encoding: 'cp1252', bom: false, eol: 'crlf', final: true })
  expect(perfil(utf8('﻿a\nb'))).toEqual({ encoding: 'utf8', bom: true, eol: 'lf', final: false })
})

test('Edit em arquivo Windows-1252 é feito pela guarda e continua Windows-1252 com CRLF', async ($, on) => {
  const arquivos = { '/p/a.php': cp1252("<?php\r\n$t = 'Ação';\r\n$u = 'é';\r\n") }
  const rodou = disco(on, arquivos)
  const r = await $.tool.call(edit('/p/a.php', "$t = 'Ação';", "$t = 'Atenção “já”';"))
  expect(r.deny).toBeUndefined()
  expect(rodou).toEqual([])
  iguais(arquivos['/p/a.php'], cp1252("<?php\r\n$t = 'Atenção “já”';\r\n$u = 'é';\r\n"))
})

test('Read de arquivo Windows-1252 mostra os acentos certos', async ($, on) => {
  disco(on, { '/p/a.php': cp1252("<?php\r\n$t = 'Ação';\r\n") })
  const r = await $.tool.call({ tool: 'Read', file_path: '/p/a.php' } as never)
  expect((r.result as { file: { content: string } }).file.content).toBe("<?php\n$t = 'Ação';")
  expect(r.context?.[0]).toContain('Windows-1252')
})

test('caractere fora do Windows-1252 é recusado e o arquivo não muda', async ($, on) => {
  const original = cp1252("<?php\r\n$ok = 'é';\r\n")
  const arquivos = { '/p/a.php': original }
  disco(on, arquivos)
  const r = await $.tool.call(edit('/p/a.php', "$ok = 'é';", "$ok = '✓';"))
  expect(r.deny).toContain('Windows-1252')
  iguais(arquivos['/p/a.php'], original)
})

test('trecho com "�" é recusado em vez de gravar lixo', async ($, on) => {
  disco(on, { '/p/a.php': cp1252("$t = 'Ação';\r\n") })
  const r = await $.tool.call(edit('/p/a.php', "'A��o'", "'Sim'"))
  expect(r.deny).toContain('"�"')
})

test('UTF-8 com BOM e CRLF volta a ter BOM e CRLF depois do Edit', async ($, on) => {
  const arquivos = { '/p/a.md': utf8('﻿# Título\r\nlinha\r\n') }
  const rodou = disco(on, arquivos)
  const r = await $.tool.call(edit('/p/a.md', 'linha', 'linha nova'))
  expect(rodou).toEqual(['Edit'])
  expect(r.context?.join(' ')).toContain('CRLF')
  iguais(arquivos['/p/a.md'], utf8('﻿# Título\r\nlinha nova\r\n'))
})

test('UTF-8 com LF e sem BOM não é regravado', async ($, on) => {
  const arquivos = { '/p/a.ts': utf8('const a = 1\n') }
  const rodou = disco(on, arquivos)
  const r = await $.tool.call(edit('/p/a.ts', '1', '2'))
  expect(rodou).toEqual(['Edit'])
  expect(r.context ?? []).toEqual([])
  iguais(arquivos['/p/a.ts'], utf8('const a = 2\n'))
})

test('arquivo novo passa direto pelo Write', async ($, on) => {
  const arquivos: Record<string, Uint8Array> = {}
  const rodou = disco(on, arquivos)
  await $.tool.call({ tool: 'Write', file_path: '/p/novo.ts', content: 'x\n' } as never)
  expect(rodou).toEqual(['Write'])
})

test('arquivo só ASCII que ganha acento num projeto Windows-1252 gera aviso', async ($, on) => {
  const arquivos = {
    '/ws/.vscode/settings.json': utf8('{ "files.encoding": "windows1252" }'),
    '/ws/adm/a.php': utf8('<?php\r\n$t = 1;\r\n'),
    '/outro/b.php': utf8('<?php\n$t = 1;\n'),
  }
  disco(on, arquivos)
  const r = await $.tool.call(edit('/ws/adm/a.php', '$t = 1;', "$t = 'Ação';"))
  expect(r.context?.join(' ')).toContain('declara Windows-1252')

  const r2 = await $.tool.call(edit('/outro/b.php', '$t = 1;', "$t = 'Ação';"))
  expect(r2.context ?? []).toEqual([])
})
