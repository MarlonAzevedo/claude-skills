export type Pendente = {
  comando: string
  motivo: string
  cwd: string
  impacto: string[]
  resumo: string
}

declare module 'claude-code' {
  interface PluginState {
    'blast-radius': { pendente: Pendente | null; aprovados: string[] }
  }
}
