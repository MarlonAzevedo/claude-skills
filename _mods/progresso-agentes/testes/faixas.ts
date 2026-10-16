// Apoio dos testes de faixa: a coluna que os mods do hamzafer/claude-code-mods devolvem e como lê-la.
export const BAND = {
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}

// O que um mod como o usage-meter desenha abaixo: a coluna `bands` com a faixa dele.
export const COLUNA = {
  type: 'Box',
  props: { key: 'bands', flexDirection: 'column' },
  children: [{ type: 'Box', props: { key: 'band:usage-meter', flexDirection: 'column' }, children: [{ type: 'Text', props: {}, children: ['5h 40%'] }] }],
}

type Achado = { key?: string; props?: { key?: string }; children: unknown[] }
type Desenho = { findAll: (q: { key: string }) => Promise<readonly Achado[]> }

// As chaves das faixas dentro da coluna; falha se houver mais de uma coluna (uma embrulhada na outra).
export const filhosDaColuna = async (ui: Desenho) => {
  const colunas = await ui.findAll({ key: 'bands' })
  if (colunas.length !== 1) return `${colunas.length} colunas`
  return (colunas[0]?.children ?? []).map(c => (c as Achado).key ?? (c as Achado).props?.key)
}
