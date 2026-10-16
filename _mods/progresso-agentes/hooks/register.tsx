import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agente, Tarefa } from '../types'
import { bandsFile, parseOrder, stackBands } from './bands'

const PANE = 'subagentes'
const tarefas = atom({ plugin: 'progresso-agentes', key: 'tarefas' } as const, [])
const agentes = atom({ plugin: 'progresso-agentes', key: 'agentes' } as const, [])
const turno = atom({ plugin: 'progresso-agentes', key: 'turno' } as const, null)

type Args = Record<string, unknown>

const barra = (feito: number, total: number, largura: number) => {
  const n = total === 0 ? 0 : Math.round((feito / total) * largura)
  return '█'.repeat(n) + '░'.repeat(largura - n)
}
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const modeloCurto = (m: string) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '')
const duracao = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}
const status = (s: unknown): Tarefa['status'] =>
  s === 'completed' || s === 'in_progress' ? s : 'pending'

// Lê as ferramentas de plano: TodoWrite, TaskCreate/TaskUpdate e o update_plan do app desktop.
const aplicar = (lista: Tarefa[], tool: string, a: Args, resultado: unknown): Tarefa[] => {
  if (tool === 'TodoWrite' && Array.isArray(a.todos)) {
    return a.todos.map((t: Args, i) => ({ id: `t${i}`, titulo: String(t.content), status: status(t.status) }))
  }
  if (tool === 'TaskCreate') {
    const task = (resultado as { task?: { id: string; subject: string } } | undefined)?.task
    return task ? [...lista, { id: task.id, titulo: task.subject, status: 'pending' }] : lista
  }
  if (tool === 'TaskUpdate') {
    if (a.status === 'deleted') return lista.filter(t => t.id !== a.taskId)
    return lista.map(t =>
      t.id === a.taskId
        ? { ...t, titulo: typeof a.subject === 'string' ? a.subject : t.titulo, status: a.status ? status(a.status) : t.status }
        : t,
    )
  }
  if (tool.endsWith('__update_plan')) {
    if (Array.isArray(a.items)) {
      return a.items.map((t: Args, i) => ({ id: `p${i}`, titulo: String(t.content), status: status(t.status) }))
    }
    let novo = lista
    if (a.advance === true) {
      const atual = novo.findIndex(t => t.status === 'in_progress')
      novo = novo.map((t, i) => (i === atual ? { ...t, status: 'completed' } : t))
      const proxima = novo.findIndex(t => t.status === 'pending')
      novo = novo.map((t, i) => (i === proxima ? { ...t, status: 'in_progress' } : t))
    }
    const feitas = Array.isArray(a.done) ? a.done.map(Number) : []
    const inicio = typeof a.start === 'number' ? a.start : -1
    return novo.map((t, i) =>
      feitas.includes(i + 1) ? { ...t, status: 'completed' } : i + 1 === inicio ? { ...t, status: 'in_progress' } : t,
    )
  }
  return lista
}

// Ordem das faixas salva pelo checklist do claude-code-mods; lida uma vez por sessão.
let ordem: Promise<string[]> | undefined
const ordemFaixas = ($: EngineInterface) => (ordem ??= lerOrdem($).catch(() => []))

async function lerOrdem($: EngineInterface): Promise<string[]> {
  const arquivo = bandsFile(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME'))
  return arquivo && (await $.fs.exists(arquivo)) ? parseOrder(await $.fs.read(arquivo)) : []
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'subagentes', description: 'Abre o painel dos subagentes' })
    return next(e)
  })

  on('command.run', { command: 'subagentes' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Subagentes', focus: true })
    return { text: 'Painel de subagentes aberto.' }
  })

  on('turn.start', async ($, e, next) => {
    const agora = await $.clock.now()
    if (e.agentId === undefined) {
      await update($, turno, () => ({ inicio: agora, passos: 0, saida: 0, ativo: true }))
      await update($, agentes, lista => lista.filter(a => a.status === 'rodando'))
      return next(e)
    }
    const id = e.agentId
    const info = (await $.agent.list()).find(a => a.id === id)
    await update($, agentes, lista => {
      const antigo = lista.find(a => a.id === id)
      const novo: Agente = antigo
        ? { ...antigo, status: 'rodando', fim: null }
        : {
            id,
            descricao: info?.description ?? e.text.slice(0, 60),
            tipo: info?.type ?? 'agente',
            modelo: '',
            status: 'rodando',
            passos: 0,
            entrada: 0,
            saida: 0,
            cacheLido: 0,
            inicio: agora,
            fim: null,
          }
      return [...lista.filter(a => a.id !== id), novo].slice(-30)
    })
    void $.ui.open({ id: PANE, title: 'Subagentes' })
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (u === null) return r
    if (e.agentId === undefined) {
      await update($, turno, t => t && { ...t, passos: t.passos + 1, saida: t.saida + u.output_tokens })
    } else {
      const id = e.agentId
      await update($, agentes, lista =>
        lista.map(a =>
          a.id === id
            ? {
                ...a,
                modelo: u.model,
                passos: a.passos + 1,
                entrada: a.entrada + u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens,
                saida: a.saida + u.output_tokens,
                cacheLido: a.cacheLido + u.cache_read_input_tokens,
              }
            : a,
        ),
      )
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const agora = await $.clock.now()
    if (e.agentId === undefined) {
      await update($, turno, t => t && { ...t, ativo: false })
    } else {
      const id = e.agentId
      const fim: Agente['status'] = e.isAborted || e.reason === 'error' || e.reason === 'refusal' ? 'falhou' : 'concluido'
      await update($, agentes, lista =>
        lista.map(a => (a.id === id ? { ...a, status: fim, fim: agora } : a)),
      )
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const tool = String(e.tool)
    const isPlano = ['TodoWrite', 'TaskCreate', 'TaskUpdate'].includes(tool) || tool.endsWith('__update_plan')
    if (!isPlano || ran.deny !== undefined || ran.isError === true) return ran
    const args = e as unknown as Args
    await update($, tarefas, lista => aplicar(lista, tool, args, ran.result))
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const t = await read($, turno)
    const ts = await read($, tarefas)
    const rodando = (await read($, agentes)).filter(a => a.status === 'rodando')
    const pendentes = ts.some(x => x.status !== 'completed')
    if (e.props.hasSurvey || t === null || !t.ativo || (!pendentes && rodando.length === 0)) {
      return next(e)
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const feitas = ts.filter(x => x.status === 'completed').length
    const atual = ts.find(x => x.status === 'in_progress')
    const largura = Math.max(10, Math.min(30, e.props.bodyColumns - 50))
    const tokens = rodando.reduce((s, a) => s + a.entrada + a.saida, 0)
    const abaixo = await next(e)

    const mine = (
      <Box flexDirection="column">
        {pendentes && (
          <Box>
            <Text color="claude">{barra(feitas, ts.length, largura)}</Text>
            <Text> {feitas}/{ts.length} </Text>
            {atual && <Text dimColor wrap="truncate-end">· {atual.titulo}</Text>}
          </Box>
        )}
        {rodando.length > 0 && (
          <Box>
            <Text dimColor>
              {rodando.length} subagente{rodando.length > 1 ? 's' : ''} rodando · {k(tokens)} tokens{' '}
            </Text>
            <Button
              key="ver-subagentes"
              label="Ver painel"
              onPress={() => void $.ui.open({ id: PANE, title: 'Subagentes', focus: true })}
            />
          </Box>
        )}
      </Box>
    )
    return stackBands(abaixo, 'progresso-agentes', mine, 'above', await ordemFaixas($))
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const lista = await read($, agentes)
    const agora = await $.clock.now()

    if (lista.length === 0) {
      return <Text dimColor>Nenhum subagente neste turno.</Text>
    }

    return (
      <Box flexDirection="column" gap={1}>
        {lista.map(a => (
          <Box key={a.id} flexDirection="column">
            <Box>
              <Text color={a.status === 'rodando' ? 'claude' : a.status === 'concluido' ? 'success' : 'error'}>
                {a.status === 'rodando' ? '● ' : a.status === 'concluido' ? '✓ ' : '✗ '}
              </Text>
              <Text bold wrap="truncate-end">{a.descricao}</Text>
            </Box>
            <Text dimColor wrap="truncate-end">
              {'  '}
              {a.tipo}
              {a.modelo ? ` · ${modeloCurto(a.modelo)}` : ''} · {a.passos} passos · {duracao((a.fim ?? agora) - a.inicio)}
            </Text>
            <Text dimColor>
              {'  '}↑ {k(a.entrada)} entrada ({k(a.cacheLido)} do cache) · ↓ {k(a.saida)} saída
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
