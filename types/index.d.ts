// Contrato autocontido (sem import): espelha State e Mode de ../core/types.ts.
declare module 'claude-code' {
  interface PluginState {
    'model-autoswitch': {
      state: {
        promptsSinceSwitch: number
        silenceLeft: number
        strikes: number
        switches: number
        estSavedUsd: number
      }
      /** Últimas decisões, mais recente primeiro. */
      log: string[]
      /** Modo escolhido em /autoswitch; null usa o da configuração. */
      mode: 'off' | 'dry-run' | 'auto' | null
    }
  }
}
