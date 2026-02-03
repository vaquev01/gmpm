---
description: GitHub sync + Dev Logs padrão
---

# Objetivo
Padronizar a rotina de sincronização com GitHub e garantir um gerador/console de logs para devs em todos os projetos.

# Quando usar
- Sempre que o usuário mencionar **GitHub** (PR, branch, push, deploy, etc.)
- Antes de começar uma tarefa que vai alterar código
- Ao finalizar a tarefa

# Checklist (antes de começar)
1. Verificar estado local
   - `git status --porcelain`
2. Se houver mudanças locais não commitadas:
   - Parar e pedir orientação (stash/commit/descartar)
3. Atualizar referências
   - `git fetch --prune`
4. Atualizar branch atual
   - `git pull --rebase`
5. Rodar validação mínima (dependendo do projeto)
   - JS/TS: `npm run lint -- --quiet` e/ou `npm run build`
   - Python: `pytest` / `ruff` / `mypy` (conforme existir)

# Checklist (ao terminar)
1. Validar
   - `npm run lint -- --quiet` / `npm run build` (ou equivalente)
2. Conferir diffs
   - `git diff`
3. Se for para publicar no GitHub:
   - confirmar que existem commits locais a enviar
   - `git push`

# Dev Logs (padrão mínimo)
## Frontend (Next.js/React)
- Capturar `console.error/warn/info/log`, `window.onerror`, `unhandledrejection`.
- Expor página `/logs` com filtro, copy e clear.
- Não logar secrets (keys/env/headers sensíveis).

## Backend (Node/Next API)
- Preferir logs estruturados e com contexto por request.
- Evitar logar tokens/chaves.

## Python
- Usar `logging` com formatter consistente.
- Capturar exceptions com stacktrace.

# Observações de segurança
- Sempre pedir aprovação do usuário antes de executar `git pull` e `git push`.
- Nunca registrar chaves/API keys em logs.
