# Planilhas de importação

Arquivos prontos para importar no **Finanças da Casa** (GitHub Pages).

## Junho 2026 (PDF exportado em 11/06/2026)

| Arquivo | Conteúdo |
| --- | --- |
| `junho-2026.csv` | Lançamentos principais do PDF (entradas + despesas) |
| `junho-2026-nubank-babi.csv` | Detalhamento da fatura Nubank Babi (opcional) |

### Como importar

1. Abra o app e selecione **Junho / 2026**
2. Menu **Importar** → **Planilha CSV ou Excel** → escolha `junho-2026.csv`

   **Ou** use **Importar planilha Junho 2026** (importação com um clique).

3. Se quiser o detalhe do Nubank **em vez** da linha única de R$ 866,00:
   - Remova a linha "Nubank Babi" antes, ou
   - Importe só o `junho-2026-nubank-babi.csv` (sem a linha de total no arquivo principal)

### Valores a revisar

Alguns valores do PDF saíram sem vírgula decimal. Foram interpretados assim:

| Lançamento | Valor importado | Observação |
| --- | --- | --- |
| Santander Crédito Gabriel | 149,00 | PDF: 14900 |
| Dízimo Gabriel | 509,00 | PDF: 50900 |
| Combustível Gabriel | 350,90 | PDF: 350900 |
| Claro Babi | 71,28 | PDF: 7128 |

Ajuste na planilha ou no app se o valor real for outro.
