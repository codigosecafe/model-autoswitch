import { DEFAULT_PRICES, type PriceTable } from './pricing'
import type { Tier } from './types'

/** Contagem de tokens de um turno, como a API reporta. */
export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/** Custo em US$ de um uso, no preço do modelo `tier`. */
export function usageCost(u: Usage, tier: Tier, prices: PriceTable = DEFAULT_PRICES): number {
  const p = prices[tier]
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      u.cache_read_input_tokens * p.cacheRead +
      u.cache_creation_input_tokens * p.cacheWrite) /
    1e6
  )
}

export type Tally = {
  turns: number
  /** Custo real dos turnos medidos (cada um no modelo em que rodou). */
  costUsd: number
  /** Os mesmos tokens no preço do modelo de referência. */
  baselineUsd: number
  turnsByTier: Record<Tier, number>
}

export const emptyTally = (): Tally => ({
  turns: 0,
  costUsd: 0,
  baselineUsd: 0,
  turnsByTier: { haiku: 0, sonnet: 0, opus: 0 },
})

const safe = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

/** Soma um turno: custo real no modelo usado e custo hipotético no de referência. */
export function addTurn(
  t: Tally,
  u: Usage,
  used: Tier,
  baseline: Tier,
  prices: PriceTable = DEFAULT_PRICES,
): Tally {
  const clean: Usage = {
    input_tokens: safe(u.input_tokens),
    output_tokens: safe(u.output_tokens),
    cache_read_input_tokens: safe(u.cache_read_input_tokens),
    cache_creation_input_tokens: safe(u.cache_creation_input_tokens),
  }
  return {
    turns: t.turns + 1,
    costUsd: t.costUsd + usageCost(clean, used, prices),
    baselineUsd: t.baselineUsd + usageCost(clean, baseline, prices),
    turnsByTier: { ...t.turnsByTier, [used]: t.turnsByTier[used] + 1 },
  }
}

/** Economia medida: referência menos real (pode ser negativa). */
export const savedUsd = (t: Tally): number => t.baselineUsd - t.costUsd
