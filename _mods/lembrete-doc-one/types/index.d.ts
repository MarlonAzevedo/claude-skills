export type Pendente = { projeto: string; pastaDoc: string | null; arquivos: string[] }

declare module 'claude-code' {
  interface PluginState {
    'lembrete-doc-one': { pendentes: Pendente[]; visivel: boolean }
  }
}
