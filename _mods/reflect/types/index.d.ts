export type Sugestao = { feedback: string; salvando: boolean }

declare module 'claude-code' {
  interface PluginState {
    reflect: { sugestao: Sugestao | null }
  }
}
