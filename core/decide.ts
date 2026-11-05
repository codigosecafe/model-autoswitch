import { DEFAULT_PRICES, perTurnSaving, recacheCost, type PriceTable } from './pricing'
import { isRework, matchRules, tierForComplexity } from './rules'
import { TIERS, type Config, type Decision, type Input, type State, type Tier } from './types'

/** Nível de um id de modelo (`claude-sonnet-5-5`, `sonnet`, ...); undefined se desconhecido. */
export function tierOf(modelId: string | undefined): Tier | undefined {
  const id = (modelId ?? '').toLowerCase()
  return TIERS.find(t => id.includes(t))
}

const HAIKU_MAX_CONTEXT = 150_000

const rank = (t: Tier): number => TIERS.indexOf(t)
const clamp = (t: Tier, min: Tier, max: Tier): Tier =>
  rank(t) < rank(min) ? min : rank(t) > rank(max) ? max : t
const bump = (t: Tier): Tier => TIERS[Math.min(rank(t) + 1, TIERS.length - 1)]!

const keep = (target: Tier, reason: string): Decision => ({
  target,
  shouldSwitch: false,
  wouldSwitch: false,
  reason,
  source: 'none',
  estSavingUsd: 0,
})

/**
 * Decide o modelo para um prompt. Pura: não chama modelo, não toca em estado.
 * O adaptador roda o classificador antes (só se `needsClassifier`) e passa `classified`.
 */
export function decide(
  input: Input,
  cfg: Config,
  state: State,
  prices: PriceTable = DEFAULT_PRICES,
): Decision {
  const current = input.currentTier
  if (cfg.mode === 'off') return keep(current ?? cfg.defaultTier, 'mode off')
  if (current === undefined) return keep(cfg.defaultTier, 'current model unknown')

  // 1. alvo: regra > classificador > padrão
  const hit = matchRules(input.prompt, cfg.extraRules)
  let target: Tier
  let source: Decision['source']
  let why: string
  if (hit) {
    target = hit.tier
    source = 'rule'
    why = hit.reason
  } else if (input.classified) {
    target = tierForComplexity(input.classified)
    source = 'classifier'
    why = `classified ${input.classified}`
  } else {
    target = cfg.defaultTier
    source = 'default'
    why = 'default tier'
  }

  // 2. retrabalho repetido sobe um nível
  if (isRework(input.prompt) && state.strikes >= 1) {
    target = bump(rank(target) < rank(current) ? current : target)
    why += ' + rework escalation'
  }
  target = clamp(target, cfg.minTier, cfg.maxTier)
  // Haiku tem janela menor: com contexto grande, o piso é o Sonnet (margem conservadora).
  if (target === 'haiku' && input.contextTokens > HAIKU_MAX_CONTEXT) {
    target = 'sonnet'
    why += ` (context ${Math.round(input.contextTokens / 1000)}k too big for haiku: sonnet floor)`
  }

  if (target === current) return { ...keep(current, `${why}: already on ${current}`), source }

  const strong = hit?.strong === true
  const goingUp = rank(target) > rank(current)

  // 3. o usuário trocou na mão há pouco
  if (state.silenceLeft > 0) return { ...keep(current, 'manual /model respected'), source }

  // 4. cooldown (subida forte ignora)
  if (state.promptsSinceSwitch < cfg.cooldown && !(goingUp && strong)) {
    return { ...keep(current, 'cooldown'), source }
  }

  // 5. proteção do cache: contexto grande e quente
  const per = perTurnSaving(current, target, prices)
  const saving = per * cfg.expectedTurns
  const big = input.cacheWarm && input.contextTokens > cfg.contextLimit
  if (big && !strong) {
    const cost = recacheCost(input.contextTokens, target, prices)
    if (goingUp || saving <= cost) {
      return { ...keep(current, `context ${Math.round(input.contextTokens / 1000)}k warm: switch not worth it`), source }
    }
  }

  const wouldSwitch = true
  return {
    target,
    wouldSwitch,
    shouldSwitch: wouldSwitch && cfg.mode === 'auto',
    reason: why,
    source,
    estSavingUsd: Math.max(saving, 0),
  }
}

/** O adaptador deve rodar o classificador? Só se nenhuma regra decide e ele está ligado. */
export const needsClassifier = (prompt: string, cfg: Config): boolean =>
  cfg.mode !== 'off' && cfg.useClassifier && matchRules(prompt, cfg.extraRules) === undefined

/** Atualiza o estado depois de um prompt tratado. */
export function afterPrompt(state: State, prompt: string, d: Decision, didSwitch: boolean): State {
  return {
    ...state,
    promptsSinceSwitch: didSwitch ? 0 : state.promptsSinceSwitch + 1,
    silenceLeft: Math.max(0, state.silenceLeft - 1),
    strikes: isRework(prompt) ? state.strikes + 1 : 0,
    switches: state.switches + (didSwitch ? 1 : 0),
    estSavedUsd: state.estSavedUsd + (didSwitch ? d.estSavingUsd : 0),
  }
}

/** O usuário digitou /model: fica quieto por `manualSilence` prompts. */
export const onManualSwitch = (state: State, cfg: Config): State => ({
  ...state,
  silenceLeft: cfg.manualSilence,
  promptsSinceSwitch: 0,
})
