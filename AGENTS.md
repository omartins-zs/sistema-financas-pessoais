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
   - Executa `npm test` para verificar merge, ordem de carregamento, cache PWA, sintaxe e regras do Firestore
   - Valida integridade do `firebase-config.js` e metadados de versão

---

## ✅ 4. Ciclo Obrigatório: Testes → Commit → Push

Vale para **toda** alteração, por menor que seja (ajuste visual, correção, refatoração, regra, documentação), nas duas branches.

1. **Testar a cada mudança:**
   - Depois de cada ajuste, rode a bateria de testes antes de seguir para o próximo passo:
     - `github-pages`: `npm test` (e `node --check <arquivo>` nos scripts alterados)
     - `master`: `php artisan test`, `./vendor/bin/pint --test` e `./vendor/bin/phpstan analyse --level=5 --memory-limit=1G`
   - Funcionalidade nova ou comportamento alterado **ganha teste automatizado** (em `tests/github-pages/` na PWA), cobrindo também os casos de borda.
   - Mudança de tela também é conferida no navegador, em largura de computador e de celular.
   - Teste falhando = parar e corrigir. **Nunca** commitar ou enviar com teste vermelho, nem pular hooks (`--no-verify`).
2. **No final de toda tarefa, sempre:**
   - Rodar os testes completos mais uma vez (o pre-commit troca a versão; confirme que tudo continua alinhado).
   - **Commitar** no padrão da seção 2 (Gitmoji + Conventional Commits em português).
   - **Fazer push** para a branch atual no GitHub (`git push origin <branch>`). Na `github-pages` o push é o deploy: sem ele a versão nova não chega aos celulares.
   - Informar o resultado: commit, versão gerada e quantos testes passaram.
3. Se o push for recusado (branch remota à frente, conflito), sincronize com `git pull --ff-only` ou resolva o conflito, teste de novo e só então envie. Nunca use `push --force`.

---

## 💾 5. Regras Críticas de Persistência (Branch `github-pages`)

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
   - Na tela, o selo da versão aparece sempre no **padrão brasileiro: `dd/mm/aaaa hh:mm`** (ex.: `v24/10/2026 12:45`), via `formatAppVersion()` em `js/80-bootstrap-pwa.js`. O formato interno `YYYYMMDD-HHMM` não muda (é o que vai no `?v=`).

6. **Organização dos scripts da PWA:**
   - A lógica de tela fica em `js/`, dividida por área funcional.
   - Os arquivos são scripts clássicos e a ordem de carregamento em `index.html` é intencional: eles compartilham declarações globais legadas. Atualize em conjunto o HTML, o shell do `sw.js`, os testes e os hooks ao adicionar ou mover arquivos.
   - Não adicione `<script type="module">` isoladamente antes de migrar explicitamente os consumidores dos globais e cobrir a inicialização com testes.
