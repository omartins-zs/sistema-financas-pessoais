# Como Executar — Local (Laragon / `php artisan serve`)

Guia para rodar o **Finanças da Casa** sem Docker, usando PHP e MySQL no seu computador.

---

## Requisitos

| Ferramenta | Versão mínima |
| --- | --- |
| PHP | 8.4+ |
| Composer | 2.x |
| MySQL | 8.x (Laragon: porta **3307**) |
| Node.js / npm | Opcional (Vite; o dashboard usa Tailwind/Livewire via CDN) |

---

## 1) Preparar ambiente

Copie o arquivo de exemplo e ajuste se necessário:

```bash
cp .env.example .env
```

No **Laragon**, crie o banco de dados:

- Nome: `financas_casa`
- Host: `127.0.0.1`
- Porta: `3307`
- Usuário: `root` (padrão Laragon, senha vazia)

Confirme no `.env` o bloco **LOCAL**:

```env
APP_LOCALE=pt_BR
APP_FALLBACK_LOCALE=pt_BR
APP_FAKER_LOCALE=pt_BR

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3307
DB_DATABASE=financas_casa
DB_USERNAME=root
DB_PASSWORD=
```

---

## 2) Instalar dependências

```bash
composer install
```

Opcional (apenas se for alterar assets com Vite):

```bash
npm install
npm run build
```

---

## 3) Inicialização e migrations

Gere a chave da aplicação:

```bash
php artisan key:generate
```

Crie as tabelas e dados de exemplo:

```bash
php artisan migrate:fresh --seed
```

> O `--seed` cria o usuário demo e lançamentos do mês atual.

---

## 4) Rodar aplicação

Servidor embutido do Laravel:

```bash
php artisan serve
```

Acesse: **http://127.0.0.1:8000**

Para desenvolvimento de assets com Vite (opcional):

```bash
npm run dev
```

---

## 5) Filas / workers

O projeto usa `QUEUE_CONNECTION=database`. Para processar filas em segundo plano (se necessário):

```bash
php artisan queue:work
```

Para uso normal do dashboard (CRUD, Livewire, gráficos), o worker **não é obrigatório**.

---

## 6) Cache e diagnóstico

Limpar caches após mudanças de config ou views:

```bash
php artisan optimize:clear
```

Ver informações do ambiente:

```bash
php artisan about
```

---

## 7) Acessos

```txt
Painel Finanças da Casa
URL de login: http://127.0.0.1:8000/login
E-mail: casa@financas.com
Senha: password
```

| Recurso | URL |
| --- | --- |
| Login | http://127.0.0.1:8000/login |
| Dashboard (após login) | http://127.0.0.1:8000 |

---

## Problemas comuns

| Sintoma | Solução |
| --- | --- |
| Erro de conexão MySQL | Verifique se o MySQL do Laragon está ativo e se `DB_PORT=3307` |
| `APP_KEY` ausente | Rode `php artisan key:generate` |
| Erro 500 após Livewire | Rode `php artisan optimize:clear` e reinicie `php artisan serve` |
| PHP incompatível | Este projeto exige PHP **8.4+** (Symfony 8 / Laravel 13) |
