export type Atividade = 'lendo' | 'editando'

export type Projeto = {
  raiz: string
  isGit: boolean
  arquivos: string[]
  // caminho relativo → código do git status (M, A, D, ??) ou 'C' para commitado e ainda não enviado
  git: Record<string, string>
}

declare module 'claude-code' {
  interface PluginState {
    'arvore-arquivos': {
      projeto: Projeto | null
      ativos: Record<string, Atividade>
      tocados: string[]
      abertas: string[]
      fechadas: string[]
    }
  }
}
