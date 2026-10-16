import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pendente } from '../types'

const PANE = 'blast-radius'
const pendente = atom({ plugin: 'blast-radius', key: 'pendente' } as const, null)
const aprovados = atom({ plugin: 'blast-radius', key: 'aprovados' } as const, [])

const RISCOS: [RegExp, string][] = [
  [/\brm\s+(-[a-zA-Z]*[rRf]|--recursive|--force)/, 'rm recursivo/forçado'],
  [/\brm\s+[^;&|]*[*?]/, 'rm com curinga'],
  [/\brmdir\b/, 'rmdir'],
  [/\bfind\b[^;&|]*\s-(delete|exec\s+rm)\b/, 'find apagando arquivos'],
  [/\bgit\s+clean\s+-[a-zA-Z]*f/, 'git clean'],
  [/\bgit\s+reset\s+[^;&|]*--hard/, 'git reset --hard'],
  [/\bgit\s+(checkout|restore)\s+[^;&|]*(--\s+)?\.(\s|$)/, 'descarta mudanças locais'],
  [/\bgit\s+push\s+[^;&|]*(-f\b|--force)/, 'git push --force'],
  [/\bgit\s+branch\s+[^;&|]*-D\b/, 'apaga branch'],
  [/\bdd\b[^;&|]*\bof=/, 'dd escrevendo em disco/arquivo'],
  [/\b(mkfs|shred|wipefs)\b/, 'formata/destrói dados'],
  [/\btruncate\s+/, 'truncate'],
  [/\b(chmod|chown)\s+-[a-zA-Z]*R/, 'permissão recursiva'],
  [/\b(drop\s+(table|database|schema)|truncate\s+table)\b/i, 'SQL destrutivo'],
  [/\bdocker\s+(system\s+prune|volume\s+(rm|prune))/, 'docker apagando dados'],
]

export const risco = (comando: string) => RISCOS.find(([re]) => re.test(comando))?.[1]

// Alvos de um rm: as palavras depois de "rm" até o fim do comando simples, sem as opções.
const alvosRm = (comando: string) =>
  [...comando.matchAll(/\brm\s+([^;&|]+)/g)].flatMap(m =>
    (m[1] ?? '')
      .trim()
      .split(/\s+/)
      .filter(p => p && !p.startsWith('-'))
      .map(p => p.replace(/^(['"])(.*)\1$/, '$2')),
  )

const LISTA = `shopt -s nullglob dotglob
for pat in "$@"; do
  pat="\${pat/#\\~/$HOME}"
  for p in $pat; do
    if [ -d "$p" ]; then printf '%s/  (%s arquivos, %s)\\n' "$p" "$(find "$p" -type f 2>/dev/null | wc -l)" "$(du -sh "$p" 2>/dev/null | cut -f1)"
    elif [ -e "$p" ]; then printf '%s  (%s)\\n' "$p" "$(du -sh "$p" 2>/dev/null | cut -f1)"
    fi
  done
done`

// Calcula o que o comando atingiria, só com leituras.
const calcular = async ($: EngineInterface, comando: string, cwd: string) => {
  const rodar = async (argv: string[]) => {
    try {
      const r = await $.process.run(argv, { cwd, timeoutMs: 8000 })
      return r.stdout.split('\n').filter(Boolean)
    } catch {
      return ['(não foi possível calcular)']
    }
  }
  if (/\brm\s/.test(comando)) {
    const linhas = await rodar(['bash', '-c', LISTA, '_', ...alvosRm(comando)])
    return { impacto: linhas, resumo: linhas.length ? `${linhas.length} item(ns) seriam apagados` : 'Nenhum alvo existe hoje' }
  }
  const clean = comando.match(/\bgit\s+clean\s+(-[a-zA-Z]+)/)
  if (clean) {
    const flags = (clean[1] ?? '').replace(/[fn]/g, '').slice(1)
    const linhas = await rodar(['git', 'clean', '-n', ...(flags ? [`-${flags}`] : [])])
    return { impacto: linhas, resumo: `${linhas.length} arquivo(s) não rastreados seriam apagados` }
  }
  if (/\bgit\s+(reset|checkout|restore)\b/.test(comando)) {
    const linhas = await rodar(['git', 'status', '--porcelain'])
    return { impacto: linhas, resumo: `${linhas.length} mudança(s) locais seriam descartadas` }
  }
  if (/\bgit\s+push\b/.test(comando)) {
    const linhas = await rodar(['git', 'log', '--oneline', 'HEAD..@{u}'])
    return { impacto: linhas, resumo: `${linhas.length} commit(s) do remoto seriam sobrescritos` }
  }
  if (/\bgit\s+branch\b/.test(comando)) {
    const nome = comando.match(/-D\s+(\S+)/)?.[1] ?? ''
    const linhas = nome ? await rodar(['git', 'log', '--oneline', `HEAD..${nome}`]) : []
    return { impacto: linhas, resumo: `${linhas.length} commit(s) só existem nessa branch` }
  }
  return { impacto: [], resumo: 'Impacto não calculável automaticamente: revise o comando.' }
}

const fechar = async ($: EngineInterface) => {
  await update($, pendente, () => null)
  await $.ui.close({ id: PANE }).catch(() => undefined)
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const comando = e.command
    const motivo = risco(comando)
    if (!motivo) return next(e)

    const liberados = await read($, aprovados)
    if (liberados.includes(comando)) {
      await update($, aprovados, l => l.filter(c => c !== comando))
      return next(e)
    }

    const cwd = await $.session.cwd()
    const { impacto, resumo } = await calcular($, comando, cwd)
    const item: Pendente = { comando, motivo, cwd, impacto, resumo }
    await update($, pendente, () => item)
    // Sem superfície para desenhar, o comando segue bloqueado do mesmo jeito.
    $.ui.open({ id: PANE, title: 'Blast Radius', focus: true, holdToasts: true }).catch(() => undefined)
    $.ui.notify(`Comando destrutivo aguardando você: ${motivo}`, { title: 'Blast Radius' }).catch(() => undefined)

    return {
      deny:
        `Blast Radius: comando destrutivo retido (${motivo}). ${resumo}. ` +
        'A pessoa vai decidir num painel com botões; só ela pode liberar. ' +
        'Não rode o comando por outro caminho nem o reescreva para escapar da checagem: pare e espere a resposta.',
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'Blast Radius: a checagem falhou, então o comando foi bloqueado.' },
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, pendente)
    if (p === null) return <Text dimColor>Nada aguardando aprovação.</Text>

    const mostrar = p.impacto.slice(0, 40)
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="error" bold>
          ⚠ {p.motivo}
        </Text>
        <Box flexDirection="column">
          <Text dimColor>Comando (em {p.cwd}):</Text>
          <Text color="warning">{p.comando}</Text>
        </Box>
        <Box flexDirection="column">
          <Text bold>{p.resumo}</Text>
          {mostrar.map(l => (
            <Text wrap="truncate-middle">  {l}</Text>
          ))}
          {p.impacto.length > mostrar.length && <Text dimColor>  … e mais {p.impacto.length - mostrar.length}</Text>}
          {/\bcd\s/.test(p.comando) && <Text dimColor>O comando troca de pasta: o cálculo acima é aproximado.</Text>}
        </Box>
        <Box gap={2}>
          <Button
            key="prosseguir"
            variant="primary"
            label="Prosseguir"
            onPress={async () => {
              await update($, aprovados, l => [...l, p.comando].slice(-10))
              await fechar($)
              await $.prompt.submit({
                text: `Blast Radius: eu aprovei o comando. Rode de novo exatamente igual, uma vez:\n\n${p.comando}`,
                asUser: true,
              })
            }}
          />
          <Button
            key="cancelar"
            role="dismiss"
            label="Cancelar"
            onPress={async () => {
              await fechar($)
              await $.prompt.submit({
                text: `Blast Radius: eu cancelei o comando \`${p.comando}\`. Não rode isso; siga sem ele ou me proponha outra saída.`,
                asUser: true,
              })
            }}
          />
        </Box>
      </Box>
    )
  })
}
