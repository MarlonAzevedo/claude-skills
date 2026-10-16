export type Aviso = {
  texto: string
  minutos: number
  tokens: number
  uso5h: number | null
  criadoEm: number
}

declare module 'claude-code' {
  interface PluginState {
    'alerta-cache': { ultimaResposta: number | null; aviso: Aviso | null }
  }
}
