import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import {
  COMPLEXITY_LABELS,
  DEFAULT_CONFIG,
  TIERS,
  afterPrompt,
  decide,
  initialState,
  mergePrices,
  needsClassifier,
  onManualSwitch,
  tierOf,
  type Complexity,
  type Config,
  type Mode,
  type Rule,
  type Tier,
} from '../core'

const CACHE_TTL_MS = 5 * 60 * 1000
const LOG_MAX = 20

const stateAtom = atom({ plugin: 'model-autoswitch', key: 'state' } as const, initialState())
const logAtom = atom({ plugin: 'model-autoswitch', key: 'log' } as const, [] as string[])
const modeAtom = atom({ plugin: 'model-autoswitch', key: 'mode' } as const, null as Mode | null)

const asTier = (v: unknown, fallback: Tier): Tier =>
  typeof v === 'string' && (TIERS as readonly string[]).includes(v) ? (v as Tier) : fallback
const asMode = (v: unknown, fallback: Mode): Mode =>
  v === 'off' || v === 'dry-run' || v === 'auto' ? v : fallback
const asNum = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback

/** Linhas "modelo[!]: regex" viram regras; linhas inválidas são ignoradas. */
function parseRules(text: unknown): Rule[] {
  if (typeof text !== 'string') return []
  const rules: Rule[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*(haiku|sonnet|opus)(!?)\s*:\s*(.+?)\s*$/i.exec(line)
    if (m) rules.push({ tier: m[1]!.toLowerCase() as Tier, strong: m[2] === '!', pattern: m[3]! })
  }
  return rules
}

function readConfig(o: Readonly<Record<string, unknown>>): Config {
  const d = DEFAULT_CONFIG
  return {
    mode: asMode(o.mode, d.mode),
    defaultTier: asTier(o.defaultModel, d.defaultTier),
    minTier: asTier(o.minModel, d.minTier),
    maxTier: asTier(o.maxModel, d.maxTier),
    contextLimit: asNum(o.contextLimit, d.contextLimit),
    cooldown: asNum(o.cooldown, d.cooldown),
    manualSilence: asNum(o.manualSilence, d.manualSilence),
    expectedTurns: asNum(o.expectedTurns, d.expectedTurns),
    useClassifier: o.useClassifier !== false,
    extraRules: parseRules(o.extraRules),
  }
}

export const register: Register = (on, options) => {
  const base = readConfig(options)
  const prices = mergePrices(typeof options.prices === 'string' ? options.prices : undefined)
  let lastTurnAt = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'autoswitch',
      description: 'Troca automática de modelo para reduzir custo',
      argumentHint: '[on|off|dry-run|status]',
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    lastTurnAt = await $.clock.now()
    return next(e)
  })

  // Um /model digitado pelo usuário vale: o plugin fica quieto por alguns prompts.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    if (e.origin.kind !== 'plugin') {
      const cfg = await effective($, base)
      await update($, stateAtom, s => onManualSwitch(s, cfg))
    }
    return next(e)
  })

  on('command.run', { command: 'autoswitch' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'auto') await update($, modeAtom, () => 'auto')
    else if (arg === 'off') await update($, modeAtom, () => 'off')
    else if (arg === 'dry-run' || arg === 'dry') await update($, modeAtom, () => 'dry-run')

    const cfg = await effective($, base)
    const s = await read($, stateAtom)
    const log = await read($, logAtom)
    const lines = [
      `autoswitch: modo ${cfg.mode}, padrão ${cfg.defaultTier}, faixa ${cfg.minTier} a ${cfg.maxTier}`,
      `trocas: ${s.switches}, economia estimada: US$ ${s.estSavedUsd.toFixed(2)} (estimativa, não é fatura)`,
      ...(log.length ? ['últimas decisões:', ...log.slice(0, 8).map(l => `  ${l}`)] : []),
    ]
    return { text: lines.join('\n') }
  })

  on('prompt.submit', async ($, e, next) => {
    // Só prompts digitados: nada de comandos, mensagens ocultas ou prompts de outros plugins.
    if (e.command || e.isMeta || e.origin.kind === 'plugin') return next(e)

    const cfg = await effective($, base)
    if (cfg.mode === 'off') return next(e)

    try {
      const current = tierOf(await $.session.model())
      const usage = await $.session.usage()
      const now = await $.clock.now()
      const state = await read($, stateAtom)

      let classified: Complexity | undefined
      if (needsClassifier(e.text, cfg)) {
        const label = await $.model.classify(e.text.slice(0, 1500), COMPLEXITY_LABELS, { model: 'haiku' })
        classified = (COMPLEXITY_LABELS as readonly (string | undefined)[]).includes(label)
          ? (label as Complexity)
          : undefined
      }

      const d = decide(
        {
          prompt: e.text,
          currentTier: current,
          contextTokens: usage.context.tokens ?? 0,
          cacheWarm: lastTurnAt > 0 && now - lastTurnAt < CACHE_TTL_MS,
          classified,
        },
        cfg,
        state,
        prices,
      )

      let didSwitch = false
      if (d.shouldSwitch) {
        didSwitch = await applyModel($, d.target)
        if (didSwitch) $.ui.toast(`autoswitch: ${current ?? '?'} → ${d.target} (${d.reason})`)
      } else if (d.wouldSwitch) {
        $.ui.status(`autoswitch dry-run: faria ${current ?? '?'} → ${d.target} (${d.reason})`)
      } else {
        $.ui.status(undefined)
      }

      const entry = `${didSwitch ? 'trocou' : d.wouldSwitch ? 'faria' : 'manteve'} ${current ?? '?'} → ${d.target}: ${d.reason}`
      await update($, logAtom, l => [entry, ...l].slice(0, LOG_MAX))
      await update($, stateAtom, s => afterPrompt(s, e.text, d, didSwitch))
    } catch {
      // Qualquer falha do plugin nunca bloqueia o prompt do usuário.
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}

/** Configuração em vigor: o modo escolhido em /autoswitch vale sobre o da configuração. */
async function effective($: any, base: Config): Promise<Config> {
  const override = await read($, modeAtom)
  return override ? { ...base, mode: override } : base
}

/** Troca o modelo já, antes do turno começar: a linha de /config é imediata; /model só roda com a sessão ociosa. */
async function applyModel($: any, tier: Tier): Promise<boolean> {
  try {
    const rows = await $.config.list()
    if (rows.some((r: { key: string }) => r.key === 'model')) {
      const r = await $.config.set({ key: 'model', value: tier })
      if (!r?.deny) return true
    }
  } catch {
    // cai para o comando
  }
  try {
    await $.command.run({ command: 'model', args: tier })
    return true
  } catch {
    return false
  }
}
