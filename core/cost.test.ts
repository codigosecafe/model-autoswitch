import { expect, test } from 'claude-code/testing'

import { addTurn, emptyTally, savedUsd, usageCost } from './cost'
import { normalizeState } from './types'

const usage = { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 5000 }

test('usageCost prices each token kind', async () => {
  // sonnet: 1000*2 + 2000*10 + 100000*0.2 + 5000*2.5 = 2000+20000+20000+12500 = 54500 / 1e6
  expect(Math.abs(usageCost(usage, 'sonnet') - 0.0545) < 1e-9).toBe(true)
})

test('a turn on sonnet saves against an opus baseline', async () => {
  const t = addTurn(emptyTally(), usage, 'sonnet', 'opus')
  expect(t.turns).toBe(1)
  expect(t.turnsByTier.sonnet).toBe(1)
  expect(savedUsd(t)).toBeGreaterThan(0)
})

test('a turn on the baseline saves nothing', async () => {
  expect(savedUsd(addTurn(emptyTally(), usage, 'opus', 'opus'))).toBe(0)
})

test('junk token counts count as zero, never NaN', async () => {
  const t = addTurn(emptyTally(), { ...usage, output_tokens: Number.NaN }, 'haiku', 'opus')
  expect(Number.isFinite(t.costUsd)).toBe(true)
})

test('an older saved state is completed with the new fields', async () => {
  const s = normalizeState({ switches: 3 } as never)
  expect(s.switches).toBe(3)
  expect(s.turns).toBe(0)
  expect(s.turnsByTier.opus).toBe(0)
})
