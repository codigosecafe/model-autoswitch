import type { Complexity, Rule, Tier } from './types'

// Regras padrão, genéricas, em inglês e português. Aplicadas ao texto em minúsculas.
// Leves só valem em prompts curtos e começando pela intenção, para não errar em prompts longos.
const LIGHT_MAX_CHARS = 220

const LIGHT: string[] = [
  '^\\s*(git\\s+(status|log|diff|branch|stash)|ls|pwd)\\b',
  '^\\s*(status|list|liste|listar|show|mostre|mostrar|quais|which|how many|quantos|quantas)\\b',
  '^\\s*(rename|renomeie|renomear|format|formate|formatar|translate|traduza|traduzir)\\b',
  '^\\s*(commit message|mensagem de commit|what does this (line|function)|o que (faz|significa))\\b',
  '^\\s*(explain|explique|explica)\\s+(this|esse|essa|isto|o)\\b',
]

const HEAVY: string[] = [
  '\\b(root[- ]cause|causa[- ]raiz)\\b',
  '\\b(investigat\\w*|investig\\w*)\\b',
  '\\b(debug\\w*|depur\\w*)\\b',
  '\\b(architect\\w*|arquitetur\\w*)\\b',
  '\\b(design (a|the|an)|projete|projetar|desenhe a)\\b',
  '\\b(refactor\\w*|refator\\w*)\\b',
  '\\b(security (review|audit)|auditoria de seguran\\w+)\\b',
  '\\b(race condition|deadlock|memory leak|vazamento de mem\\w+)\\b',
  '\\b(review (the|this) (pr|pull request|diff)|revis\\w+ (o|esse|este) (pr|pull request|diff))\\b',
  '\\b(trade-?offs?|prós e contras|pros and cons)\\b',
]

const STACK_TRACE = /(traceback \(most recent|exception in thread|^\s+at .+\(.+:\d+:\d+\)|^\s+at .+:\d+)/m

export type RuleHit = { tier: Tier; strong: boolean; reason: string }

function matches(pattern: string, text: string): boolean {
  try {
    return new RegExp(pattern, 'i').test(text)
  } catch {
    return false // padrão inválido do usuário é ignorado, nunca quebra o hook
  }
}

/** Primeira regra que casa: as do usuário, depois as padrão. */
export function matchRules(prompt: string, extra: readonly Rule[]): RuleHit | undefined {
  const text = prompt.toLowerCase()
  for (const r of extra) {
    if (matches(r.pattern, text)) {
      return { tier: r.tier, strong: r.strong === true, reason: `rule /${r.pattern}/` }
    }
  }
  if (text.length <= LIGHT_MAX_CHARS) {
    for (const p of LIGHT) {
      if (matches(p, text)) return { tier: 'haiku', strong: false, reason: 'simple request' }
    }
  }
  for (const p of HEAVY) {
    if (matches(p, text)) return { tier: 'opus', strong: false, reason: 'hard reasoning keyword' }
  }
  if (STACK_TRACE.test(prompt)) return { tier: 'opus', strong: false, reason: 'stack trace' }
  return undefined
}

export const COMPLEXITY_LABELS: readonly Complexity[] = ['simple', 'standard', 'hard']

export const tierForComplexity = (c: Complexity): Tier =>
  c === 'simple' ? 'haiku' : c === 'hard' ? 'opus' : 'sonnet'

const REWORK =
  /(n[ãa]o funcionou|continua (errado|falhando|quebrado)|ainda (falha|quebra|erra)|est[áa] errado|didn'?t work|still (fails|failing|broken|wrong)|that'?s wrong|not working)/i

export const isRework = (prompt: string): boolean => REWORK.test(prompt)
