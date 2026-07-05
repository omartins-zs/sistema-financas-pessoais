# Estrutura de banco de dados — GitHub Pages (Firebase / Google)

> **Documentação gerada** — resumo no [README](../README.md#-estrutura-de-banco-de-dados-google-firebase). Este arquivo contém a versão detalhada com exemplos JSON.

| Modo | Onde | Chave / caminho |
|------|------|------------------|
| **Local** (padrão) | `localStorage` do navegador | `financas_casa_dados` |
| **Nuvem** (Google) | Firebase **Firestore** | coleção `financas` → documento `{uid}` |

Implementação: [`cloud-sync.js`](../cloud-sync.js) · Configuração: [`firebase-config.js`](../firebase-config.js) · Guia: [`FIREBASE.md`](../FIREBASE.md)

---

## Firestore (Google Cloud)

```
Firestore Database
│
└── financas                          ← coleção
    │
    └── {uid}                         ← documento (1 por usuário logado)
        │
        ├── data          (string)    ← JSON completo do app (ver abaixo)
        └── updatedAt     (timestamp) ← última sincronização
```

### Regras de segurança (Firestore)

Cada usuário só acessa o próprio documento (`request.auth.uid == uid`).

### Fluxo

1. Usuário faz login com **Firebase Authentication** (e-mail/senha)
2. App carrega `financas/{uid}.data` → faz `JSON.parse`
3. Ao salvar, o app serializa tudo de volta em `data` (debounce ~600 ms)

---

## Estrutura raiz do JSON (`allData`)

O objeto completo salvo em `localStorage` ou em `financas/{uid}.data`:

```json
{
  "2026-06": [ /* lançamentos de junho/2026 */ ],
  "2026-07": [ /* lançamentos de julho/2026 */ ],
  "2026-08": [ /* ... */ ],

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
| `"YYYY-MM"` | `array` | Lançamentos financeiros daquele mês |
| `"__app"` | `object` | Dados dos módulos extras (metas, cartões, etc.) |

> Chaves no formato `YYYY-MM` são meses. A chave `__app` **não** é um mês — não entra nos cálculos mensais.

---

## Lançamento mensal (`"YYYY-MM"[]`)

Cada item do array representa uma entrada, despesa ou investimento.

```json
{
  "id": "m5abc12",
  "description": "Nubank Gabriel",
  "category": "Cartão de crédito Gabriel",
  "type": "despesa",
  "person": "gabriel",
  "value": 2726.47,
  "status": "pago",
  "due_day": 10,
  "observation": "Fatura Jul/2026",
  "card_items": []
}
```

| Campo | Tipo | Valores / observação |
|-------|------|----------------------|
| `id` | string | ID único gerado no cliente |
| `description` | string | Nome do lançamento |
| `category` | string | Ex.: `Mercado`, `Cartão de crédito Gabriel` |
| `type` | string | `entrada` · `despesa` · `investimento` |
| `person` | string | `gabriel` · `barbara` · `casa` · `familia` · `""` |
| `value` | number | Valor em reais |
| `status` | string | `pago` · `reservado` · `nao_pago` |
| `due_day` | number \| null | Dia de vencimento (1–31) |
| `observation` | string | Texto livre |
| `card_items` | array | Itens da fatura (cartões de crédito) |

### Item de cartão (`card_items[]`)

Usado quando `category` contém cartão de crédito.

```json
{
  "id": "m5item1",
  "description": "Keeta",
  "value": 69.45,
  "recurring": false,
  "isDefault": false
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID único do item |
| `description` | string | Nome do gasto (ex.: `Cartão` = placeholder da fatura) |
| `value` | number | Valor do item |
| `recurring` | boolean | `true` = recorrente no cartão / Contas fixas |
| `isDefault` | boolean | Opcional — item base `Cartão` quando a fatura ainda não foi detalhada |

---

## Módulos em `__app`

Todos os arrays abaixo ficam dentro de `allData.__app`.

### `metas[]` — Metas financeiras

```json
{
  "id": "meta1",
  "nome": "Viagem",
  "valorObjetivo": 5000,
  "dataAlvo": "2026-12-31",
  "prioridade": "media",
  "status": "ativa",
  "aportes": [
    { "id": "ap1", "valor": 500, "data": "2026-07-01" }
  ]
}
```

| Campo | Tipo |
|-------|------|
| `prioridade` | `alta` · `media` · `baixa` |
| `status` | `ativa` · `concluida` · `pausada` |

---

### `reservas[]` — Reservas por objetivo

```json
{
  "id": "res1",
  "nome": "Emergência",
  "objetivo": 10000,
  "movimentacoes": [
    {
      "id": "mov1",
      "tipo": "deposito",
      "valor": 200,
      "data": "2026-07-04",
      "obs": ""
    }
  ]
}
```

| Campo | Tipo |
|-------|------|
| `movimentacoes[].tipo` | `deposito` · `saque` |

---

### `cartoes[]` — Cartões cadastrados (módulo Cartões)

```json
{
  "id": "cart1",
  "nome": "Nubank",
  "bandeira": "Visa",
  "limite": 5000,
  "fechamento": 5,
  "vencimento": 10
}
```

---

### `comprasCartao[]` — Compras parceladas

```json
{
  "id": "comp1",
  "cartaoId": "cart1",
  "descricao": "Notebook",
  "valor": 1200,
  "parcelas": 12,
  "data": "2026-06-15",
  "categoria": "Outros"
}
```

---

### `investimentos[]` — Portfólio de investimentos

```json
{
  "id": "inv1",
  "tipo": "CDB",
  "instituicao": "Nubank",
  "valorAplicado": 1000,
  "valorAtual": 1050,
  "data": "2026-01-10"
}
```

---

### `patrimonio[]` — Bens e patrimônio

```json
{
  "id": "pat1",
  "nome": "Apartamento",
  "tipo": "Imóvel",
  "valorCompra": 250000,
  "valorAtual": 280000,
  "dataAquisicao": "2020-03-01",
  "obs": ""
}
```

---

### `assinaturas[]` — Contas fixas (serviços recorrentes)

```json
{
  "id": "ass1",
  "nome": "Internet Vivo",
  "valor": 100,
  "vencimentoDia": 15,
  "forma": "Boleto",
  "status": "ativa"
}
```

| Campo | Tipo |
|-------|------|
| `forma` | `Cartão` · `Débito` · `Pix` · `Boleto` · `Outro` |
| `status` | `ativa` · `cancelada` |

---

## Diagrama resumido

```
┌─────────────────────────────────────────────────────────┐
│  Firebase Auth (Google) — login e-mail/senha            │
└──────────────────────────┬──────────────────────────────┘
                           │ uid
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Firestore: financas / {uid}                            │
│  └── data: "{ ... JSON allData ... }"                   │
└──────────────────────────┬──────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
   "2026-07": []                      "__app": {}
   lançamentos do mês                  metas, reservas,
                                       cartoes, etc.
```

---

## Backup e exportação

- **Exportar JSON:** menu Exportar → `JSON — backup completo` (mesma estrutura acima)
- **Importar:** restaura o objeto `allData` inteiro
- **CSV/Excel:** exporta só o **mês atual** (não inclui `__app`)

---

## Observações

- Não há tabelas SQL nesta branch — tudo é **documento JSON**.
- Gabriel e Barbara compartilham dados usando **a mesma conta Firebase** (mesmo e-mail/senha).
- A branch `master` (Laravel) usa **MySQL** com estrutura diferente — não se aplica ao GitHub Pages.
