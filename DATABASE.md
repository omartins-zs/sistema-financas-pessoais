# 🗄️ Estrutura de Dados — GitHub Pages (Firebase / localStorage)

Documentação da “base de dados” usada na branch **`github-pages`**: app estático com persistência em **localStorage** ou **Google Firebase** (Auth + Firestore).

> Para configurar o Firebase, veja [`FIREBASE.md`](FIREBASE.md).

---

## 📌 Visão geral

| Modo | Onde salva | Quando usa |
|------|------------|------------|
| **Local** | `localStorage` → chave `financas_casa_dados` | Firebase não configurado |
| **Nuvem (Google)** | Firestore → coleção `financas` | `firebase-config.js` preenchido |

Em ambos os casos, o **formato dos dados é o mesmo**: um único objeto JSON (`allData`).

Implementação: [`cloud-sync.js`](cloud-sync.js) (`AppStorage`).

---

## ☁️ Firestore (Google Cloud)

### Hierarquia

```
Firestore Database
└── financas                          ← coleção
    └── {uid}                           ← documento (1 por usuário logado)
        ├── data          (string)      ← JSON.stringify(allData) — todos os dados
        └── updatedAt     (timestamp)   ← última sincronização
```

### Regras de segurança (recomendadas)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function dono(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    match /financas/{uid} {
      allow read, write: if dono(uid);

      // Permissões do documento pai não se estendem às subcoleções.
      match /logs/{logId} {
        allow read, write: if dono(uid);
      }
      match /backups/{backupId} {
        allow read, write: if dono(uid);
      }
      match /backupsMeta/{backupId} {
        allow read, write: if dono(uid);
      }
    }
  }
}
```

Cada usuário só acessa o **próprio documento** (`uid` = ID do Firebase Auth).

### Autenticação

- **Firebase Authentication** — e-mail/senha
- Gabriel e Barbara compartilham os mesmos lançamentos usando **a mesma conta** (mesmo e-mail/senha)

---

## 💾 localStorage (modo offline)

| Chave | Conteúdo |
|-------|----------|
| `financas_casa_dados` | Objeto JSON completo (`allData`) |
| `financas_casa_theme` | Tema: `light` ou `dark` |

Dados ficam **apenas no navegador** onde foram salvos.

---

## 📦 Estrutura do JSON (`allData`)

```json
{
  "2026-06": [ /* lançamentos de junho/2026 */ ],
  "2026-07": [ /* lançamentos de julho/2026 */ ],
  "__app": {
    "metas": [],
    "reservas": [],
    "cartoes": [],
    "comprasCartao": [],
    "investimentos": [],
    "patrimonio": [],
    "assinaturas": []
  }
}
```

| Chave | Tipo | Descrição |
|-------|------|-----------|
| `YYYY-MM` | `array` | Lançamentos financeiros do mês |
| `__app` | `object` | Módulos extras (metas, cartões, etc.) |

Chaves de mês seguem o padrão **`YYYY-MM`** (ex.: `2026-07`).

---

## 📋 Lançamento mensal (`financial entry`)

Cada item do array `"YYYY-MM"`:

| Campo | Tipo | Obrigatório | Valores / descrição |
|-------|------|-------------|---------------------|
| `id` | `string` | ✅ | ID único gerado no cliente |
| `description` | `string` | ✅ | Nome do lançamento |
| `category` | `string` | ✅ | Ex.: `Cartão de crédito Gabriel`, `Mercado`, `Investimentos` |
| `type` | `string` | ✅ | `entrada` \| `despesa` \| `investimento` |
| `person` | `string` | ✅ | `gabriel` \| `barbara` \| `casa` \| `familia` |
| `value` | `number` | ✅ | Valor em R$ (decimal) |
| `status` | `string` | ✅ | `pago` \| `reservado` \| `nao_pago` |
| `due_day` | `number` \| `null` | ❌ | Dia de vencimento (1–31) |
| `observation` | `string` | ❌ | Observação livre |
| `card_items` | `array` | ❌ | Itens da fatura (cartões de crédito) |

### Exemplo

```json
{
  "id": "m1abc2",
  "description": "Nubank Gabriel",
  "category": "Cartão de crédito Gabriel",
  "type": "despesa",
  "person": "gabriel",
  "value": 2726.47,
  "status": "pago",
  "due_day": 10,
  "observation": "Fatura Jul/2026",
  "card_items": [
    {
      "id": "i1xyz",
      "description": "Keeta",
      "value": 69.45,
      "recurring": false
    },
    {
      "id": "i2xyz",
      "description": "Cartão",
      "value": 1800.00,
      "isDefault": true
    }
  ]
}
```

---

## 💳 Item de fatura (`card_items[]`)

Usado em lançamentos de categoria **Cartão de crédito**.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string` | ID único do item |
| `description` | `string` | Nome (ex.: Keeta, Cartão, Gasolina) |
| `value` | `number` | Valor do item |
| `recurring` | `boolean` | `true` = recorrente no cartão |
| `isDefault` | `boolean` | Opcional — item base “Cartão” com total inicial |

- **`isDefault: true`** → placeholder com valor total da fatura antes do detalhamento
- Itens **`recurring: true`** aparecem também em **Contas fixas → Recorrentes no cartão**
- O **`value`** do lançamento = soma de todos os `card_items`

Lógica: [`script.js`](script.js) — `normalizeEntry`, `addCardItem`, `syncCardEntryFromItems`.

---

## 🧩 Módulos em `__app`

Dados dos módulos extras ([`app-modules.js`](app-modules.js)). Todos ficam dentro de `allData.__app`.

### `metas[]` — Metas financeiras

| Campo | Tipo |
|-------|------|
| `id` | string |
| `nome` | string |
| `valorObjetivo` | number |
| `dataAlvo` | string (ISO date) |
| `prioridade` | `alta` \| `media` \| `baixa` |
| `status` | `ativa` \| `concluida` \| `pausada` |
| `aportes[]` | array |

**`aportes[]`:**

| Campo | Tipo |
|-------|------|
| `id` | string |
| `valor` | number |
| `data` | string (ISO date) |

---

### `reservas[]` — Reservas por objetivo

| Campo | Tipo |
|-------|------|
| `id` | string |
| `nome` | string |
| `objetivo` | number (opcional) |
| `movimentacoes[]` | array |

**`movimentacoes[]`:**

| Campo | Tipo |
|-------|------|
| `id` | string |
| `tipo` | `deposito` \| `saque` |
| `valor` | number |
| `data` | string (ISO date) |
| `obs` | string |

---

### `cartoes[]` — Cartões cadastrados (módulo Cartões)

| Campo | Tipo |
|-------|------|
| `id` | string |
| `nome` | string |
| `bandeira` | string (Visa, Mastercard…) |
| `limite` | number |
| `fechamento` | number (dia 1–31) |
| `vencimento` | number (dia 1–31) |

---

### `comprasCartao[]` — Compras parceladas

| Campo | Tipo |
|-------|------|
| `id` | string |
| `cartaoId` | string → FK para `cartoes[].id` |
| `descricao` | string |
| `valor` | number (total da compra) |
| `parcelas` | number |
| `data` | string (ISO date) |
| `categoria` | string |

---

### `investimentos[]` — Portfólio de investimentos

| Campo | Tipo |
|-------|------|
| `id` | string |
| `tipo` | string (CDB, Tesouro, Ações…) |
| `instituicao` | string |
| `valorAplicado` | number |
| `valorAtual` | number |
| `data` | string (ISO date) |

> Diferente de `type: "investimento"` nos lançamentos mensais — este é o **portfólio** acumulado.

---

### `patrimonio[]` — Bens / patrimônio

| Campo | Tipo |
|-------|------|
| `id` | string |
| `nome` | string |
| `tipo` | string (Imóvel, Carro…) |
| `valorCompra` | number |
| `valorAtual` | number |
| `dataAquisicao` | string (ISO date) |
| `obs` | string |

---

### `assinaturas[]` — Contas fixas (serviços recorrentes)

| Campo | Tipo |
|-------|------|
| `id` | string |
| `nome` | string |
| `valor` | number (mensal) |
| `vencimentoDia` | number (1–31) |
| `forma` | string (Cartão, Pix, Boleto…) |
| `status` | `ativa` \| `cancelada` |

---

## 🔄 Fluxo de persistência

```
Usuário edita dado
       ↓
script.js / app-modules.js  →  allData (memória)
       ↓
AppStorage.save(allData)
       ↓
   ┌───────────────────────────────────┐
   │ Firebase ativo?                   │
   ├──────────── YES ────→ Firestore    │
   │              financas/{uid}        │
   │              (debounce 600ms)      │
   ├──────────── NO  ────→ localStorage │
   │              financas_casa_dados   │
   └───────────────────────────────────┘
```

**Backup manual:** Exportar → JSON (backup completo) inclui `__app` e todos os meses.

**Importação:** Restaurar backup JSON ou importar CSV/Excel (só mês atual).

---

## 📊 Diagrama simplificado

```
allData
├── "2025-01" → [ entry, entry, ... ]
├── "2025-02" → [ entry, entry, ... ]
├── ...
├── "2026-07" → [ entry, entry, ... ]
└── "__app"
    ├── metas[]           → { aportes[] }
    ├── reservas[]        → { movimentacoes[] }
    ├── cartoes[]
    ├── comprasCartao[]   → cartaoId → cartoes
    ├── investimentos[]
    ├── patrimonio[]
    └── assinaturas[]

entry (lançamento)
├── campos básicos
└── card_items[] (se cartão)
        └── { id, description, value, recurring?, isDefault? }
```

---

## ⚠️ Observações importantes

1. **Não é SQL** — não há tabelas, joins nem migrations; tudo é JSON aninhado.
2. **Um documento por usuário** no Firestore — limite ~1 MB por documento (Firestore).
3. **Mesma estrutura** no localStorage e no Firestore.
4. A branch **`master`** (Laravel) usa **MySQL** com estrutura diferente — ver migrations em `database/migrations/` naquela branch.

---

## 📁 Arquivos relacionados

| Arquivo | Função |
|---------|--------|
| [`cloud-sync.js`](cloud-sync.js) | Camada AppStorage (local + Firebase) |
| [`firebase-config.js`](firebase-config.js) | Credenciais Firebase |
| [`script.js`](script.js) | Lançamentos mensais, `card_items`, import/export |
| [`app-modules.js`](app-modules.js) | Módulos em `__app` |
| [`FIREBASE.md`](FIREBASE.md) | Passo a passo para ativar a nuvem |
