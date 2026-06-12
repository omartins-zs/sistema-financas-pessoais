# Planilhas de importação

Arquivos prontos para importar no **Finanças da Casa** (GitHub Pages).

## Junho 2026 (PDF exportado em 11/06/2026)

| Arquivo | Conteúdo |
| --- | --- |
| `junho-2026.csv` | Lançamentos completos do PDF (entradas, despesas e investimentos/reservas) |
| `junho-2026-nubank-babi.csv` | Detalhamento opcional da fatura Nubank Babi |

### Como importar

1. Abra o app e selecione **Junho / 2026**
2. Menu **Importar** → **Importar planilha Junho 2026** (um clique)

   Ou importe manualmente `junho-2026.csv`.

3. O arquivo principal já inclui **Nubank Babi R$ 866,00**. O detalhe Nubank é **opcional** — use só se quiser ver cada item da fatura (remova a linha do total antes).

### Tags (Gabriel / Barbara / Casa)

Cada lançamento pode ter uma **Tag** indicando de quem sai ou entra o dinheiro:

| Tag | Uso |
| --- | --- |
| **Gabriel** | Despesa ou entrada do Gabriel |
| **Barbara** | Despesa ou entrada da Barbara (Babi) |
| **Casa** | Contas compartilhadas da casa |
| **Família** | Gastos familiares (ex.: convênio médico) |

Coluna na planilha: `Tag` (também aceita `Pessoa` ou `Responsável`).

### Investimentos (reservas)

Estes lançamentos entram no bloco **Investimentos e Reservas**, não nas despesas:

- Investimentos Babi (R$ 1.000)
- Reserva viagem (R$ 500)
- Reserva Emergência PT Babi / PF Gabriel
- Caixinha Turbo PF Gabriel
- Reserva geral

### Valores interpretados do PDF

Alguns valores do PDF saíram sem vírgula decimal. Foram interpretados assim:

| Lançamento | Valor importado | Observação |
| --- | --- | --- |
| Santander Crédito Gabriel | 149,00 | PDF: 14900 |
| Dízimo Gabriel | 509,00 | PDF: 50900 |
| Combustível Gabriel | 350,90 | PDF: 350900 |
| Claro Babi | 71,28 | PDF: 7128 |

Ajuste na planilha ou no app se o valor real for outro.
