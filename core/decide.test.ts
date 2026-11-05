import { expect, test } from 'claude-code/testing'

import { afterPrompt, decide, needsClassifier, onManualSwitch, tierOf } from './decide'
import { DEFAULT_CONFIG, initialState, type Config, type Input } from './types'

const auto: Config = { ...DEFAULT_CONFIG, mode: 'auto' }
const base = (over: Partial<Input> = {}): Input => ({
  prompt: 'implement the endpoint',
  currentTier: 'opus',
  contextTokens: 20_000,
  cacheWarm: false,
  ...over,
})

test('tierOf reads ids and aliases', async () => {
  expect(tierOf('claude-sonnet-5-5')).toBe('sonnet')
  expect(tierOf('opus')).toBe('opus')
  expect(tierOf('gpt-x')).toBe(undefined)
})

test('a simple request goes to haiku, in english and portuguese', async () => {
  expect(decide(base({ prompt: 'git status' }), auto, initialState()).target).toBe('haiku')
  expect(decide(base({ prompt: 'liste os arquivos alterados' }), auto, initialState()).target).toBe('haiku')
})

test('a hard request goes to opus', async () => {
  const d = decide(base({ prompt: 'investigate the root cause of the deadlock', currentTier: 'sonnet' }), auto, initialState())
  expect(d.target).toBe('opus')
  expect(d.shouldSwitch).toBe(true)
})

test('no rule and no classifier falls to the default tier', async () => {
  const d = decide(base(), auto, initialState())
  expect(d.target).toBe('sonnet')
  expect(d.source).toBe('default')
})

test('the classifier decides when no rule does', async () => {
  const d = decide(base({ classified: 'hard', currentTier: 'sonnet' }), auto, initialState())
  expect(d.target).toBe('opus')
  expect(d.source).toBe('classifier')
  expect(needsClassifier('implement the endpoint', auto)).toBe(true)
  expect(needsClassifier('git status', auto)).toBe(false)
})

test('dry-run never switches but says it would', async () => {
  const d = decide(base({ prompt: 'git status' }), { ...auto, mode: 'dry-run' }, initialState())
  expect(d.shouldSwitch).toBe(false)
  expect(d.wouldSwitch).toBe(true)
})

test('off does nothing', async () => {
  expect(decide(base(), { ...auto, mode: 'off' }, initialState()).wouldSwitch).toBe(false)
})

test('a manual /model silences the plugin', async () => {
  const s = onManualSwitch(initialState(), auto)
  const d = decide(base({ prompt: 'git status' }), auto, s)
  expect(d.wouldSwitch).toBe(false)
  expect(d.reason).toMatch(/manual/)
})

test('cooldown blocks a second switch, a strong upgrade passes', async () => {
  const s = afterPrompt(initialState(), 'x', decide(base(), auto, initialState()), true)
  expect(decide(base({ prompt: 'git status' }), auto, s).reason).toBe('cooldown')
  const strong: Config = { ...auto, extraRules: [{ pattern: 'prod incident', tier: 'opus', strong: true }] }
  const d = decide(base({ prompt: 'prod incident now', currentTier: 'haiku' }), strong, s)
  expect(d.target).toBe('opus')
  expect(d.shouldSwitch).toBe(true)
})

test('a big warm context blocks a weak switch and allows a strong one', async () => {
  const big = base({ prompt: 'implement the endpoint', contextTokens: 400_000, cacheWarm: true })
  expect(decide(big, auto, initialState()).wouldSwitch).toBe(false)
  const strong: Config = { ...auto, extraRules: [{ pattern: 'implement', tier: 'sonnet', strong: true }] }
  expect(decide(big, strong, initialState()).wouldSwitch).toBe(true)
})

test('a cold cache does not hold a big context back', async () => {
  const cold = base({ prompt: 'implement the endpoint', contextTokens: 400_000, cacheWarm: false })
  expect(decide(cold, auto, initialState()).wouldSwitch).toBe(true)
})

test('repeated rework escalates one tier', async () => {
  const s = afterPrompt(initialState(), "it didn't work", decide(base(), auto, initialState()), false)
  const d = decide(base({ prompt: "still broken, it didn't work", currentTier: 'haiku', classified: 'simple' }), auto, { ...s, promptsSinceSwitch: 99 })
  expect(d.target).toBe('sonnet')
})

test('min and max bound the choice', async () => {
  const d = decide(base({ prompt: 'git status' }), { ...auto, minTier: 'sonnet' }, initialState())
  expect(d.target).toBe('sonnet')
})

test('an invalid user rule is ignored, never throws', async () => {
  const bad: Config = { ...auto, extraRules: [{ pattern: '(', tier: 'opus' }] }
  expect(decide(base(), bad, initialState()).target).toBe('sonnet')
})

test('a context too big for haiku keeps sonnet as the floor', async () => {
  const d = decide(base({ prompt: 'git status', contextTokens: 300_000, cacheWarm: false }), auto, initialState())
  expect(d.target).toBe('sonnet')
})

test('the haiku floor explains itself in the reason', async () => {
  const d = decide(base({ prompt: 'git status', contextTokens: 300_000 }), auto, initialState())
  expect(d.reason).toMatch(/too big for haiku/)
})
