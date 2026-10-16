export type Tarefa = {
  id: string
  titulo: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type Agente = {
  id: string
  descricao: string
  tipo: string
  modelo: string
  status: 'rodando' | 'concluido' | 'falhou'
  passos: number
  entrada: number
  saida: number
  cacheLido: number
  inicio: number
  fim: number | null
}

export type Turno = { inicio: number; passos: number; saida: number; ativo: boolean }

declare module 'claude-code' {
  interface PluginState {
    'progresso-agentes': { tarefas: Tarefa[]; agentes: Agente[]; turno: Turno | null }
  }
}
