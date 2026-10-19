import type { Register } from 'claude-code'

const MARK = '+'

// Set by the prompt that starts the turn, cleared when the turn ends.
let hardTurn = false

export const register: Register = on => {
  on('prompt.submit', ($, e, next) => {
    hardTurn = e.text.startsWith(MARK)
    return next(hardTurn ? { ...e, text: e.text.slice(MARK.length).trimStart() } : e)
  })

  on('turn.complete', ($, e, next) => {
    hardTurn = false
    return next(e)
  })

  // The main loop's requests of a marked turn ask for max effort, when the model takes an effort at all;
  // subagents keep the effort they were configured with.
  on('turn.step', async function* ($, e, next) {
    return yield* next(hardTurn && e.agentId === undefined && e.effort !== undefined ? { ...e, effort: 'max' } : e)
  })
}
