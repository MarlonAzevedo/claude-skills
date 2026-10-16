import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Aviso } from '../types'
import { bandsFile, parseOrder, stackBands } from './bands'

const ultimaResposta = atom({ plugin: 'alerta-cache', key: 'ultimaResposta' } as const, null)
const aviso = atom({ plugin: 'alerta-cache', key: 'aviso' } as const, null)

const MINUTO = 60_000
// Por quanto tempo um segundo Enter no mesmo texto conta como "enviar mesmo assim".
const CONFIRMA_MS = 10 * MINUTO

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// Ordem das faixas salva pelo checklist do claude-code-mods; lida uma vez por sessão.
let ordem: Promise<string[]> | undefined
const ordemFaixas = ($: EngineInterface) => (ordem ??= lerOrdem($).catch(() => []))

async function lerOrdem($: EngineInterface): Promise<string[]> {
  const arquivo = bandsFile(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME'))
  return arquivo && (await $.fs.exists(arquivo)) ? parseOrder(await $.fs.read(arquivo)) : []
}

export const register: Register = (on, options) => {
  const ttl = Number(options.ttlMinutos ?? 60) * MINUTO
  const minimo = Number(options.minimoTokens ?? 30000)

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const agora = await $.clock.now()
      await update($, ultimaResposta, () => agora)
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Só o que a pessoa digita com a sessão parada; comandos, mensagens de plugins e envios no meio de um turno passam.
    if (e.origin.kind !== 'composer' || e.command || e.isMeta || e.turnId) return next(e)

    const agora = await $.clock.now()
    const pendente = await read($, aviso)
    if (pendente && pendente.texto === e.text && agora - pendente.criadoEm < CONFIRMA_MS) {
      await update($, aviso, () => null)
      return next(e)
    }

    const fim = await read($, ultimaResposta)
    if (fim === null || agora - fim < ttl) return next(e)

    const uso = await $.session.usage()
    const tokens = uso.context.tokens ?? 0
    if (tokens < minimo) return next(e)

    const novo: Aviso = {
      texto: e.text,
      minutos: Math.floor((agora - fim) / MINUTO),
      tokens,
      uso5h: uso.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed ?? null,
      criadoEm: agora,
    }
    await update($, aviso, () => novo)
    // Devolve o texto à caixa para a pessoa decidir.
    $.clock.after(50, () => void $.prompt.fill({ text: e.text }))

    return {
      drop:
        `Cache expirado há ${novo.minutos} min: enviar agora reprocessa ~${k(tokens)} tokens sem cache. ` +
        'Aperte Enter de novo para enviar mesmo assim, ou rode /compact antes.',
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const a = await read($, aviso)
    if (a === null || e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const abaixo = await next(e)
    const limpar = () => update($, aviso, () => null)

    const mine = (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
          <Text color="warning" bold>
            Cache expirado há {a.minutos} min
          </Text>
          <Text>
            Enviar agora reprocessa ~{k(a.tokens)} tokens da conversa sem desconto de cache
            {a.uso5h !== null ? ` (janela de 5h em ${a.uso5h}%)` : ''}.
          </Text>
          <Box gap={2}>
            <Button
              key="enviar"
              variant="primary"
              label="Enviar mesmo assim"
              onPress={async () => {
                await $.prompt.fill({ text: '' })
                await limpar()
                await $.prompt.submit({ text: a.texto, asUser: true })
              }}
            />
            <Button
              key="compactar"
              label="Compactar antes"
              onPress={async () => {
                await limpar()
                await $.prompt.fill({ text: '/compact' })
              }}
            />
            <Button key="fechar" role="dismiss" label="Fechar" onPress={limpar} />
          </Box>
        </Box>
      </Box>
    )
    return stackBands(abaixo, 'alerta-cache', mine, 'above', await ordemFaixas($))
  })
}
