declare module 'claude-code' {
  interface PluginState {
    // marked: the draft in the prompt box starts with the mark.
    // turn: the main loop's turn that runs on Haiku, while it runs.
    'use-haiku': { marked: boolean; turn: string | null }
  }
}

export {}
