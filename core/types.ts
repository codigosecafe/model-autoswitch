// Núcleo agnóstico de agente: nada aqui importa 'claude-code' nem usa `$`.

export type Tier = 'haiku' | 'sonnet' | 'opus'
export const TIERS: readonly Tier[] = ['haiku', 'sonnet', 'opus']

export type Mode = 'off' | 'dry-run' | 'auto'

/** Resultado do classificador barato (ou undefined quando indisponível). */
export type Complexity = 'simple' | 'standard' | 'hard'

export type Rule = {
  /** Expressão regular (sem barras), aplicada ao texto em minúsculas. */
  pattern: string
  tier: Tier
  /** Regra forte: vale mesmo com cooldown e contexto grande. */
  strong?: boolean
}

export type Config = {
  mode: Mode
  defaultTier: Tier
  minTier: Tier
  maxTier: Tier
  /** Acima deste contexto (tokens) com cache quente, só troca se compensar. */
  contextLimit: number
  /** Modelo de referência para medir a economia (o que você usaria sem o plugin). */
  baselineTier: Tier
  /** Prompts mínimos entre duas trocas. */
  cooldown: number
  /** Prompts em silêncio depois de o usuário trocar o modelo na mão. */
  manualSilence: number
  /** Turnos futuros assumidos para estimar a economia de uma troca. */
  expectedTurns: number
  useClassifier: boolean
  extraRules: Rule[]
}

export type State = {
  promptsSinceSwitch: number
  silenceLeft: number
  strikes: number
  switches: number
  /** Economia estimada acumulada, em US$ (estimativa, não é fatura). */
  estSavedUsd: number
  /** Medição real por turno: custo no modelo usado e na referência. */
  turns: number
  costUsd: number
  baselineUsd: number
  turnsByTier: Record<Tier, number>
}

export type Input = {
  prompt: string
  currentTier: Tier | undefined
  contextTokens: number
  cacheWarm: boolean
  classified?: Complexity
}

export type Decision = {
  target: Tier
  /** Verdadeiro quando o plugin quer trocar (e o modo permite). */
  shouldSwitch: boolean
  /** O que ele faria ignorando o modo (usado em dry-run). */
  wouldSwitch: boolean
  reason: string
  source: 'rule' | 'classifier' | 'default' | 'none'
  estSavingUsd: number
}

export const DEFAULT_CONFIG: Config = {
  mode: 'dry-run',
  defaultTier: 'sonnet',
  baselineTier: 'opus',
  minTier: 'haiku',
  maxTier: 'opus',
  contextLimit: 120_000,
  cooldown: 4,
  manualSilence: 6,
  expectedTurns: 8,
  useClassifier: true,
  extraRules: [],
}

export const initialState = (): State => ({
  promptsSinceSwitch: 99,
  silenceLeft: 0,
  strikes: 0,
  switches: 0,
  estSavedUsd: 0,
  turns: 0,
  costUsd: 0,
  baselineUsd: 0,
  turnsByTier: { haiku: 0, sonnet: 0, opus: 0 },
})

/** Estado salvo por uma versão anterior pode não ter os campos novos: completa com os iniciais. */
export const normalizeState = (raw: Partial<State> | undefined): State => {
  const d = initialState()
  return { ...d, ...raw, turnsByTier: { ...d.turnsByTier, ...(raw?.turnsByTier ?? {}) } }
}
