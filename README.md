# model-autoswitch

**PT-BR** | [English](#english)

Plugin para o Claude Code que troca o modelo (haiku, sonnet, opus) a cada prompt para reduzir custo, sem você precisar lembrar do `/model`. Foi pensado para qualquer pessoa ou time: nada nele é específico de um fluxo de trabalho.

## Como funciona

1. **Regras locais** (gratuitas, em português e inglês) resolvem os casos óbvios: pedidos simples vão para o Haiku; investigação, arquitetura e depuração difícil vão para o Opus.
2. **Classificador Haiku** decide só o que nenhuma regra cobriu (custo desprezível por prompt). Pode ser desligado.
3. **Proteção do cache:** trocar de modelo perde o prompt cache. Com contexto grande e cache quente, o plugin só troca se a economia estimada superar o custo de reescrever o cache. Há também intervalo mínimo entre trocas.
4. **Respeita você:** se você digitar `/model`, o plugin fica quieto por alguns prompts.
5. **Retrabalho:** se a resposta falhar duas vezes seguidas, sobe um nível.

Começa em **dry-run**: só mostra na linha de status o que faria. Quando confiar, ligue o modo `auto`.

## Instalação (via GitHub)

No prompt do Claude Code:

```
/plugin install model-autoswitch --marketplace <owner>/<repo>
```

Responda `y` para adicionar o marketplace e escolha o escopo. Depois ajuste as opções em `/config` (linhas `model-autoswitch.*`).

## Uso

```
/autoswitch status     # modo, trocas, economia estimada e últimas decisões
/autoswitch dry-run    # só avisa
/autoswitch on         # troca sozinho
/autoswitch off        # desliga
```

## Configuração

| Opção | Padrão | O que faz |
| --- | --- | --- |
| `mode` | `dry-run` | `off`, `dry-run` ou `auto` |
| `defaultModel` | `sonnet` | quando nada decide |
| `minModel` / `maxModel` | `haiku` / `opus` | faixa permitida |
| `contextLimit` | `120000` | contexto acima do qual a troca precisa compensar |
| `cooldown` | `4` | prompts entre trocas |
| `manualSilence` | `6` | prompts de silêncio após `/model` manual |
| `expectedTurns` | `8` | turnos assumidos na estimativa de economia |
| `useClassifier` | `true` | usar o Haiku nos casos em dúvida |
| `extraRules` | vazio | uma por linha, `modelo[!]: regex` (`!` = regra forte) |
| `prices` | tabela padrão | JSON opcional com preços em US$ por milhão |

Exemplo de `extraRules`:

```
haiku: ^(status|deploy log)\b
opus!: \bprod(uction)? incident\b
```

## Estrutura

- `core/`: lógica de decisão pura (regras, preços, histerese), sem dependência do Claude. É o que um futuro adaptador reaproveita.
- `hooks/` e `.claude-plugin/`: adaptador do Claude Code.
- `adapters/codex/`: reservado para o adaptador do Codex (ainda não implementado).

## Limites

- A economia mostrada é uma **estimativa** (preços de lista e volumes típicos), não a fatura.
- O plugin troca o modelo da sessão principal, não de subagentes.
- Se uma organização bloquear um modelo, o plugin tenta e, se falhar, mantém o atual.

---

## English

Claude Code plugin that switches the model (haiku, sonnet, opus) per prompt to cut cost, without you remembering `/model`. It is workflow-agnostic.

**How it works:** free local rules (English and Portuguese) handle obvious cases; a cheap Haiku classifier handles the rest (optional); a cache guard avoids switching on big warm contexts unless the estimated saving beats the re-cache cost; a manual `/model` silences the plugin for a few prompts; repeated rework escalates one tier. It starts in **dry-run**.

**Install:**

```
/plugin install model-autoswitch --marketplace <owner>/<repo>
```

**Use:** `/autoswitch status | dry-run | on | off`. Options are listed in the table above and appear in `/config` as `model-autoswitch.*`.

**Limits:** savings are estimates from list prices and typical volumes; only the main session model is switched; the `core/` folder is agent-agnostic so a Codex adapter can reuse it later.
