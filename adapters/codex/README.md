# Adaptador Codex (futuro)

Reservado. A política de decisão vive em `../../core/` e não depende do Claude Code. O adaptador do Codex deve:

1. montar o `Input` (`prompt`, nível atual, tokens de contexto, cache quente) a partir dos ganchos do Codex CLI;
2. chamar `decide()` e `afterPrompt()` do `core`;
3. aplicar o modelo escolhido, com um mapa próprio de `haiku | sonnet | opus` para os modelos equivalentes do Codex.

A validar: se o Codex CLI expõe um gancho por prompt e troca de modelo em sessão. Sem isso, o fallback é um wrapper ou profile que escolhe o modelo ao iniciar a sessão.
