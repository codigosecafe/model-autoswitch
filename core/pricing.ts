import type { Tier } from './types'

/** US$ por milhão de tokens. Tabela padrão, sobrescrevível pelo usuário. */
export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type PriceTable = Record<Tier, Price>

// Tabela de lista (Opus 5.5, Sonnet 5.5, Haiku 5.5); escrita de cache 5 min = 1,25x a entrada.
export const DEFAULT_PRICES: PriceTable = {
  opus: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  sonnet: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  haiku: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
}

/** Mescla uma tabela parcial (JSON do usuário) sobre a padrão; ignora lixo. */
export function mergePrices(json: string | undefined): PriceTable {
  if (!json) return DEFAULT_PRICES
  try {
    const raw = JSON.parse(json) as Partial<Record<Tier, Partial<Price>>>
    const out = { ...DEFAULT_PRICES }
    for (const t of Object.keys(DEFAULT_PRICES) as Tier[]) {
      const p = raw?.[t]
      if (p && typeof p === 'object') {
        const merged = { ...DEFAULT_PRICES[t] }
        for (const k of Object.keys(merged) as (keyof Price)[]) {
          const v = p[k]
          if (typeof v === 'number' && v >= 0) merged[k] = v
        }
        out[t] = merged
      }
    }
    return out
  } catch {
    return DEFAULT_PRICES
  }
}

// Volume típico de um turno, só para estimar (não é medição).
const OUT_TOKENS = 1500
const NEW_WRITE_TOKENS = 3000

/** Custo de reescrever `tokens` de contexto no cache do modelo de destino. */
export function recacheCost(tokens: number, to: Tier, prices: PriceTable): number {
  return (tokens / 1e6) * prices[to].cacheWrite
}

/** Economia estimada por turno ao descer de `from` para `to` (negativa ao subir). */
export function perTurnSaving(from: Tier, to: Tier, prices: PriceTable): number {
  const f = prices[from]
  const t = prices[to]
  return ((f.output - t.output) * OUT_TOKENS + (f.cacheWrite - t.cacheWrite) * NEW_WRITE_TOKENS) / 1e6
}
