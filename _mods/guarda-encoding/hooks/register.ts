// Guarda de encoding: nenhuma edição muda encoding, BOM, quebra de linha ou final de arquivo.
//   Windows-1252 (PHP legado): o Edit/Write grava em UTF-8 e troca todo acento por U+FFFD,
//   então a guarda lê, edita e grava ela mesma em Windows-1252, e o Read mostra os acentos certos.
//   UTF-8: o Edit/Write roda normal e a guarda devolve o BOM, o CRLF/LF e o final que o arquivo tinha.
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

export type Perfil = {
  encoding: 'utf8' | 'cp1252'
  bom: boolean
  eol: 'crlf' | 'lf' | 'misto' | 'nenhum'
  final: boolean
}

type Args = { file_path?: string; old_string?: string; new_string?: string; replace_all?: boolean; content?: string }

// 0x80–0x9F do Windows-1252; os 5 bytes sem caractere ficam como o controle C1 de mesmo número.
const FAIXA_80 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ'
const PARA_1252 = new Map([...FAIXA_80].map((c, i) => [c, 0x80 + i]))

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const deBase64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

export const paraBase64 = (bytes: Uint8Array) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

// UTF-8 estrito: sequências bem formadas, sem sobrelongas nem substitutos.
export const ehUtf8 = (b: Uint8Array) => {
  for (let i = 0; i < b.length; ) {
    const x = b[i]!
    const n = x < 0x80 ? 0 : x >= 0xc2 && x <= 0xdf ? 1 : x >= 0xe0 && x <= 0xef ? 2 : x >= 0xf0 && x <= 0xf4 ? 3 : -1
    if (n < 0 || i + n >= b.length + (n === 0 ? 1 : 0)) return false
    for (let k = 1; k <= n; k++) if (((b[i + k] ?? 0) & 0xc0) !== 0x80) return false
    const y = b[i + 1] ?? 0
    if ((x === 0xe0 && y < 0xa0) || (x === 0xed && y > 0x9f) || (x === 0xf0 && y < 0x90) || (x === 0xf4 && y > 0x8f)) return false
    i += n + 1
  }
  return true
}

export const de1252 = (b: Uint8Array) =>
  Array.from(b, x => (x >= 0x80 && x <= 0x9f ? FAIXA_80[x - 0x80]! : String.fromCharCode(x))).join('')

// { falta } com o primeiro caractere que não existe em Windows-1252.
export const para1252 = (texto: string): { bytes: Uint8Array } | { falta: string } => {
  const out: number[] = []
  for (const c of texto) {
    const cp = c.codePointAt(0)!
    const byte = PARA_1252.get(c) ?? (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : undefined)
    if (byte === undefined) return { falta: c }
    out.push(byte)
  }
  return { bytes: Uint8Array.from(out) }
}

const quebras = (texto: string): Perfil['eol'] => {
  const crlf = (texto.match(/\r\n/g) ?? []).length
  const lf = (texto.match(/\n/g) ?? []).length
  return lf === 0 ? 'nenhum' : crlf === lf ? 'crlf' : crlf === 0 ? 'lf' : 'misto'
}

export const perfil = (b: Uint8Array): Perfil => {
  const bom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf
  const utf8 = ehUtf8(b)
  const texto = utf8 ? textoUtf8(b) : de1252(b)
  return { encoding: utf8 ? 'utf8' : 'cp1252', bom: utf8 && bom, eol: quebras(texto), final: /\n$/.test(texto) }
}

// Texto UTF-8 sem o BOM (o BOM fica no Perfil).
const textoUtf8 = (b: Uint8Array) => {
  const corpo = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b
  return new TextDecoder('utf-8').decode(corpo)
}

// Devolve ao texto UTF-8 editado o BOM, a quebra de linha e o final que o arquivo tinha.
export const restaurar = (antes: Perfil, depois: Uint8Array): { texto: string; mudancas: string[] } | null => {
  const agora = perfil(depois)
  if (agora.encoding !== 'utf8') return null
  let texto = textoUtf8(depois)
  const mudancas: string[] = []
  if (antes.eol === 'crlf' && (agora.eol === 'lf' || agora.eol === 'misto')) {
    texto = texto.replace(/\r?\n/g, '\r\n')
    mudancas.push('CRLF')
  } else if (antes.eol === 'lf' && (agora.eol === 'crlf' || agora.eol === 'misto')) {
    texto = texto.replace(/\r\n/g, '\n')
    mudancas.push('LF')
  }
  const tinhaFinal = /\n$/.test(texto)
  if (antes.final !== tinhaFinal && quebras(texto) !== 'nenhum') {
    texto = antes.final ? texto + (antes.eol === 'crlf' ? '\r\n' : '\n') : texto.replace(/\r?\n$/, '')
    mudancas.push(antes.final ? 'quebra no fim' : 'sem quebra no fim')
  }
  if (antes.bom !== agora.bom) mudancas.push(antes.bom ? 'BOM' : 'sem BOM')
  return mudancas.length ? { texto: (antes.bom ? '﻿' : '') + texto, mudancas } : null
}

// Aplica um Edit/Write no texto já decodificado (com LF); devolve o texto novo ou o motivo da recusa.
export const aplicar = (tool: string, a: Args, base: string): { texto: string } | { recusa: string } => {
  if (tool === 'Write') {
    const conteudo = (a.content ?? '').replace(/\r\n/g, '\n')
    return conteudo.includes('�') ? { recusa: 'o conteúdo tem "�": leia o arquivo de novo, os acentos aparecem certos agora' } : { texto: conteudo }
  }
  const velho = (a.old_string ?? '').replace(/\r\n/g, '\n')
  const novo = (a.new_string ?? '').replace(/\r\n/g, '\n')
  if (velho.includes('�') || novo.includes('�')) {
    return { recusa: 'o trecho tem "�": leia o arquivo de novo, os acentos aparecem certos agora' }
  }
  const vezes = velho ? base.split(velho).length - 1 : 0
  if (vezes === 0) return { recusa: 'old_string não foi encontrado no arquivo' }
  if (vezes > 1 && !a.replace_all) return { recusa: `old_string aparece ${vezes} vezes; dê mais contexto ou use replace_all` }
  return { texto: a.replace_all ? base.split(velho).join(novo) : base.replace(velho, () => novo) }
}

// O projeto declara Windows-1252? (ex.: .vscode/settings.json com "files.encoding": "windows1252").
export const DICA_1252 = /"files\.encoding"\s*:\s*"windows1252"/

const projetoEm1252 = async ($: EngineInterface, caminho: string) => {
  const partes = caminho.split('/').slice(0, -1)
  for (let n = partes.length; n > 1; n--) {
    const config = `${partes.slice(0, n).join('/')}/.vscode/settings.json`
    if (await $.fs.exists(config).catch(() => false)) return DICA_1252.test(await $.fs.read(config).catch(() => ''))
  }
  return false
}

const ehAscii = (b: Uint8Array) => b.every(x => x < 0x80)

const lerBytes = async ($: EngineInterface, caminho: string) => {
  try {
    return deBase64((await $.fs.read(caminho, { as: 'bytes' })).base64)
  } catch {
    return null
  }
}

// $.fs.write só grava UTF-8: os bytes Windows-1252 vão por base64 -d.
const gravarBytes = async ($: EngineInterface, caminho: string, bytes: Uint8Array) => {
  const r = await $.process.run(['sh', '-c', 'base64 -d > "$1"', 'sh', caminho], { stdin: paraBase64(bytes) })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `base64 saiu com ${r.exitCode}`)
}

// Read de um arquivo Windows-1252: troca o conteúdo lido (com "�") pelo decodificado certo.
const releitura = (ran: ToolCallResult, bytes: Uint8Array): ToolCallResult => {
  const r = ran.result as { type?: string; file?: { content: string; startLine: number; numLines: number } } | undefined
  if (ran.deny !== undefined || ran.isError === true || r?.type !== 'text' || !r.file) return ran
  const linhas = de1252(bytes).split(/\r?\n/)
  const inicio = Math.max(0, r.file.startLine - 1)
  const content = linhas.slice(inicio, inicio + r.file.numLines).join('\n')
  return {
    result: { ...r, file: { ...r.file, content } },
    context: ['guarda-encoding: este arquivo é Windows-1252. Os acentos acima já estão certos; edite normalmente, a guarda grava em Windows-1252.'],
  } as ToolCallResult
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const a = e as unknown as Args
    if (!['Read', 'Edit', 'Write'].includes(tool) || !a.file_path) return next(e)

    const caminho = a.file_path
    const antes = await lerBytes($, caminho)
    if (antes === null || antes.length === 0) return next(e)
    const p = perfil(antes)

    if (p.encoding === 'cp1252') {
      if (tool === 'Read') return releitura(await next(e), antes)

      const base = de1252(antes).replace(/\r\n/g, '\n')
      const feito = aplicar(tool, a, base)
      if ('recusa' in feito) return { deny: `guarda-encoding (${caminho} é Windows-1252): ${feito.recusa}.` }
      const final = p.eol === 'crlf' ? feito.texto.replace(/\n/g, '\r\n') : feito.texto
      const codificado = para1252(final)
      if ('falta' in codificado) {
        return { deny: `guarda-encoding: "${codificado.falta}" não existe em Windows-1252, então não cabe em ${caminho}. Use outro caractere.` }
      }
      await gravarBytes($, caminho, codificado.bytes)
      $.ui.toast(`guarda-encoding: ${caminho.split('/').pop()} gravado em Windows-1252${p.eol === 'crlf' ? ' com CRLF' : ''}`)
      const result =
        tool === 'Write'
          ? { type: 'update', filePath: caminho, content: feito.texto, structuredPatch: [], originalFile: base }
          : { filePath: caminho, oldString: a.old_string ?? '', newString: a.new_string ?? '', originalFile: base, structuredPatch: [], userModified: false, replaceAll: a.replace_all === true }
      return { result, context: [`guarda-encoding: ${caminho} é Windows-1252; a mudança foi gravada em Windows-1252, sem passar para UTF-8.`] } as never
    }

    if (tool === 'Read') return next(e)
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    const depois = await lerBytes($, caminho)
    // Arquivo só ASCII serve como UTF-8 e como Windows-1252: o primeiro acento decide, e o Edit grava UTF-8.
    if (depois && ehAscii(antes) && !ehAscii(depois) && !caminho.endsWith('.md') && (await projetoEm1252($, caminho))) {
      $.ui.toast(`guarda-encoding: ${caminho.split('/').pop()} ganhou acento em UTF-8 num projeto Windows-1252`)
      return {
        ...ran,
        context: [
          ...(ran.context ?? []),
          `guarda-encoding: ${caminho} era só ASCII e agora tem caractere fora do ASCII gravado em UTF-8, mas o projeto declara Windows-1252 (.vscode/settings.json). Confira com a pessoa se o arquivo deve ficar em Windows-1252.`,
        ],
      }
    }
    const conserto = depois && restaurar(p, depois)
    if (!conserto) return ran
    await $.fs.write(caminho, conserto.texto)
    $.ui.toast(`guarda-encoding: devolvi ${conserto.mudancas.join(', ')} em ${caminho.split('/').pop()}`)
    return { ...ran, context: [...(ran.context ?? []), `guarda-encoding: restaurei ${conserto.mudancas.join(', ')} em ${caminho}, como o arquivo era.`] }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'guarda-encoding: a checagem falhou, então a edição foi bloqueada para não arriscar o encoding.' }))
}
