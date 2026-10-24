# 🤖 Regras do Projeto & Diretrizes de Desenvolvimento (AGENTS.md)

Este documento define as regras obrigatórias de desenvolvimento, padrões de commit, ciclo de testes, persistência e automação via Git Hooks para desenvolvedores e agentes de IA neste repositório.

---

## 🌳 1. Estrutura de Branches

| Branch | Propósito | Tecnologias | Deploy / Execução |
|---|---|---|---|
| **`github-pages`** | PWA estático do casal | HTML5, Vanilla CSS, JS (ES6+), Firebase (Auth + Firestore) | GitHub Pages (`omartins-zs.github.io/sistema-financas-pessoais`) |
| **`master`** | Backend / App Web Laravel | PHP 8.2+, Laravel 11, Livewire, MySQL, Docker | Ambiente Docker / Hospedagem |

---

## 📝 2. Padrão Obrigatório de Commits (Git Log)

Sempre siga o padrão de **Gitmoji + Conventional Commits** em português, conforme histórico do repositório:

### Prefixos e Gitmojis:
- `:sparkles: feat: <descrição em minúsculas>` — Nova funcionalidade
- `:bug: fix: <descrição em minúsculas>` — Correção de bug ou persistência
- `:recycle: refactor: <descrição em minúsculas>` — Refatoração de código sem alterar comportamento
- `:style: style: <descrição em minúsculas>` — Ajustes visuais, CSS e layout
- `:books: docs: <descrição em minúsculas>` — Documentação e guias
- `:wrench: chore: <descrição em minúsculas>` — Configurações, dependências, scripts
- `:bricks: ci: <descrição em minúsculas>` — CI/CD, hooks e automações

### Exemplos reais do projeto:
```
:sparkles: feat: investimentos, tags e importacao na master
:bug: fix: persistencia 100% confiavel e reconciliacao de valores
:books: docs: criando guias de execucao e perf
:wrench: chore: configurando git hooks de pre-commit e pre-push
```

---

## 🪝 3. Git Hooks Automáticos (`.githooks/`)

O repositório possui hooks versionados em [`.githooks/`](.githooks):

- **Ativação inicial (uma única vez por clone):**
  ```bash
  git config core.hooksPath .githooks
  ```

### Hook: `.githooks/pre-commit`
Executa antes de cada commit:
1. **Ambiente Laravel (`master`):**
   - `composer lint` (Laravel Pint — formatação de código)
   - `composer analyse` (Larastan — análise estática nível 5)
2. **Ambiente Web / PWA (`github-pages`):**
   - Valida ausência de marcadores de conflito (`<<<<<<<`, `=======`, `>>>>>>>`)
   - Verifica consistência de versão (`meta[name="app-version"]` vs `?v=`)

### Hook: `.githooks/pre-push`
Executa antes de enviar ao GitHub:
1. **Ambiente Laravel (`master`):**
   - `php artisan test` (Bateria completa de testes de integridade)
   - `./vendor/bin/pint --test` (Validação estrita de estilo)
   - `./vendor/bin/phpstan analyse --level=5 --memory-limit=1G`
2. **Ambiente Web / PWA (`github-pages`):**
   - Valida integridade do `firebase-config.js` e metadados de versão

---

## 💾 4. Regras Críticas de Persistência (Branch `github-pages`)

Para nunca perder dados preenchidos pelo usuário:

1. **Espelho Local Síncrono (0ms):**
   - Qualquer mutação em `allData` DEVE salvar imediatamente no `localStorage` antes de qualquer chamada assíncrona (`localSave(data, true)`).
2. **Ciclo de Vida do Navegador:**
   - Sempre disparar `flushCloudSave()` nos eventos `visibilitychange` (ao minimizar ou trocar de aba no celular), `pagehide` e `beforeunload`.
3. **Sem Mutação em Memória antes do Diff:**
   - **NUNCA** altere objetos diretamente no array vivo antes de calcular o histórico de auditoria (`diffListas` / `registrarHistorico`). Sempre faça clone profundo (`cloneDados(item)` / `JSON.parse(JSON.stringify(item))`) antes da edição.
4. **Merge Inteligente (`mergeAllData`):**
   - Manter resolução com base em timestamps (`_updatedAt`) e mapa de exclusões (`_deleted`) para que nenhuma aba ou dispositivo sobrescreva alterações de outro.
5. **Versionamento PWA com Data e Horário (`YYYYMMDD-HHMM`):**
   - O hook `.githooks/pre-commit` atualiza automaticamente a versão no `index.html` (`meta[name="app-version"]` e todas as query strings `?v=`) para o formato de data e horário atual (ex.: `20261024-1245`), garantindo que o Service Worker e os navegadores/celulares baixem a versão mais recente e nunca fiquem presos em cache antigo.
