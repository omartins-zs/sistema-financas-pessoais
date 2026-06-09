# Finanças da Casa — Laravel

Sistema de finanças pessoais para controle mensal da casa, com autenticação, MySQL e interface moderna (Tailwind + Flowbite).

> A versão estática para GitHub Pages permanece na branch `master`.  
> Esta versão Laravel fica na branch `laravel`.

## Requisitos

- PHP 8.2+ (Laragon: **PHP 8.4.6**)
- Composer
- MySQL 8+ (Laragon: **MySQL 8.0.30**, porta **3307**)
- Laragon (recomendado) ou servidor equivalente

## Instalação rápida (Laragon)

### 1. Clone e entre na branch Laravel

```bash
git clone <seu-repositorio> sistema-financas-pessoais
cd sistema-financas-pessoais
git checkout laravel
```

### 2. Instale dependências

```bash
composer install
```

### 3. Configure o ambiente

```bash
cp .env.example .env
php artisan key:generate
```

Edite o `.env` com seus dados MySQL:

```env
DB_DATABASE=financas_casa
DB_USERNAME=root
DB_PASSWORD=
DB_PORT=3307
APP_URL=http://sistema-financas-pessoais.test
```

### 4. Crie o banco no MySQL

```sql
CREATE DATABASE financas_casa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Rode migrations e seed

```bash
php artisan migrate --seed
```

### 6. Inicie o servidor

```bash
php artisan serve
```

Ou use o virtual host do Laragon apontando para a pasta `public/`.

Acesse: `http://sistema-financas-pessoais.test` ou `http://127.0.0.1:8000`

## Login de demonstração

| Campo | Valor |
|-------|-------|
| E-mail | `casa@financas.com` |
| Senha | `password` |

## Estrutura do projeto

```
app/
├── Enums/
│   ├── EntryStatus.php      # paid, reserved, unpaid
│   └── EntryType.php        # income, expense
├── Http/
│   ├── Controllers/
│   │   ├── Auth/LoginController.php
│   │   ├── FinancialDashboardController.php
│   │   └── FinancialEntryController.php
│   └── Requests/
│       ├── StoreFinancialEntryRequest.php
│       └── UpdateFinancialEntryRequest.php
├── Models/
│   ├── FinancialEntry.php
│   └── User.php
├── Policies/
│   └── FinancialEntryPolicy.php
└── Services/
    └── FinancialEntryService.php

config/financial.php           # Categorias e meses em PT-BR

database/migrations/           # users + financial_entries

resources/views/
├── layouts/app.blade.php
├── auth/login.blade.php
└── financial/
    ├── dashboard.blade.php
    └── partials/

public/js/financial.js         # Chart.js, SweetAlert2, fetch status
```

## Rotas principais

| Método | Rota | Ação |
|--------|------|------|
| GET | `/` | Dashboard |
| POST | `/entries` | Criar lançamento |
| PUT | `/entries/{id}` | Editar lançamento |
| DELETE | `/entries/{id}` | Excluir lançamento |
| PATCH | `/entries/{id}/status` | Alterar status (AJAX) |
| POST | `/month/copy` | Copiar mês anterior |
| DELETE | `/month/clear` | Limpar mês atual |
| GET | `/login` | Login |
| POST | `/logout` | Logout |

## Funcionalidades

- Controle mensal por mês/ano
- Entradas e despesas separadas
- Status com cores: Pago (verde), Reservado (amarelo), Não pago (vermelho)
- Alteração rápida de status via select
- Copiar mês anterior (sem duplicar, status volta para "Não pago")
- Limpar mês com confirmação
- Dashboard com cards de resumo
- Gráficos Chart.js (entradas x despesas, despesas por categoria)
- Cada usuário vê apenas seus lançamentos

## Tecnologias (via CDN)

- Tailwind CSS
- Flowbite
- Font Awesome
- SweetAlert2
- Chart.js

## Branches

| Branch | Conteúdo |
|--------|----------|
| `master` | Sistema Laravel + MySQL (projeto principal) |
| `github-pages` | App estático para publicar no GitHub Pages |
