---
description: Atualização obrigatória da versão do App (cache busting)
---
# Regra de Versionamento do PWA

O PWA possui cache (service worker e localStorage). Para garantir que o celular de todos os usuários receba as novas atualizações, a tag `?v=` no `index.html` precisa ser atualizada **antes de todo commit e push**.

**Instruções:**
Sempre que você alterar qualquer arquivo e for fazer um commit/push:
1. Abra o arquivo `index.html`.
2. Encontre todas as ocorrências da versão atual (exemplo: `v20260925-10`).
3. Substitua por uma nova string usando a data de hoje e um número sequencial, por exemplo: `v20261007-1`. Se já foi atualizada hoje, incremente o dígito no final.
4. Faça o commit incluindo o `index.html`.
