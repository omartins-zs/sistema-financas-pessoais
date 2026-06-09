<div align="center">

<img src="https://skillicons.dev/icons?i=laravel,php,mysql,tailwind,js" height="48" />

# 💰 Finanças da Casa

[![PHP](https://img.shields.io/badge/PHP-8.4-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![Laravel](https://img.shields.io/badge/Laravel-13-FF2D20?style=for-the-badge&logo=laravel&logoColor=white)](https://laravel.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CDN-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

<p>Sistema de controle financeiro pessoal para gestão mensal da casa — entradas, despesas, status e gráficos.</p>

<cite>Controle simples, bonito e seguro das finanças do lar, mês a mês.</cite>

</div>

---

## 🚦 Status do Projeto

<div align="center">
  <h4>✅ Finanças da Casa &nbsp;🚀 Em desenvolvimento contínuo ⚙️</h4>
</div>

---

## 📦 Sobre os Projetos neste Repositório

Este repositório contém **dois projetos**:

| Branch | Projeto | Tecnologia | Descrição |
|--------|---------|------------|-----------|
| `master` | **Finanças da Casa — Laravel** | Laravel 13 + MySQL | Versão principal com autenticação, banco de dados e interface completa |
| `github-pages` | **Finanças da Casa — Estático** | HTML + JS + LocalStorage | Versão publicada no GitHub Pages, sem backend |

> 🌐 **GitHub Pages:** [omartins-zs.github.io/sistema-financas-pessoais](https://omartins-zs.github.io/sistema-financas-pessoais)

---

## 🏗️ Arquitetura do Projeto

- **Tipo:** Monólito
- **Padrão:** MVC (Laravel) com Service Layer
- **Backend + Frontend juntos** — Blade templates renderizados pelo servidor
- **Autenticação** própria (sem pacote externo), com proteção por `user_id` em todos os dados

---

## 🔥 Pré-requisitos

- PHP **8.2+** (ambiente: PHP 8.4.6)
- Composer
- MySQL **8.0+** (Laragon: porta **3307**)
- Node.js (opcional, apenas para build de assets)

---

## 🚀 Tecnologias Utilizadas

### Backend
| Tecnologia | Versão |
|------------|--------|
| PHP | 8.4.6 |
| Laravel Framework | ^13.8 |
| MySQL | 8.0.30 |

### Frontend (via CDN)
| Tecnologia | Uso |
|------------|-----|
| Tailwind CSS | Estilização responsiva |
| Flowbite | Componentes UI |
| Font Awesome 6 | Ícones |
| SweetAlert2 | Confirmações e alertas |
| Chart.js 4 | Gráficos |

### Padrões e Organização
- Service Layer (`FinancialEntryService`)
- Form Requests (validação desacoplada)
- Policies (autorização por `user_id`)
- PHP Enums (`EntryType`, `EntryStatus`)
- Clean Code + MVC

---

## 🔨 Funcionalidades

- 🔐 **Autenticação** — Login, logout e dados isolados por usuário
- 📅 **Controle mensal** — Filtragem por mês e ano com navegação
- ➕ **Entradas e despesas** — Cadastro, edição e exclusão de lançamentos
- 🎨 **Status com cores** — Pago (verde), Reservado (amarelo), Não pago (vermelho)
- ⚡ **Alteração rápida de status** — Via select com fetch (sem recarregar a página)
- 📋 **Copiar mês anterior** — Traz lançamentos sem duplicar; status volta para "Não pago"
- 🗑️ **Limpar mês** — Remove todos os lançamentos do mês com confirmação SweetAlert2
- 📊 **Dashboard com cards** — Totais de entradas, despesas, saldo, pago, reservado e não pago
- 📈 **Gráficos** — Entradas × Despesas e Despesas por categoria (Chart.js, recolhíveis)
- 📱 **Responsivo** — Layout mobile-first, tabela no desktop e cards no celular

---

## 🎯 Sobre o Projeto

Sistema desenvolvido para uso familiar no controle das finanças mensais da casa. Demonstra boas práticas de desenvolvimento com Laravel, arquitetura limpa com Service Layer, Enums e Policies, além de interface moderna com Tailwind CSS e Flowbite — tudo via CDN, sem processo de build obrigatório.

---

## 📸 Preview

🚧 Preview não disponível ainda.

---

## 💻 Instalação e Execução

```bash
# 1. Clone o repositório
git clone https://github.com/omartins-zs/sistema-financas-pessoais.git
cd sistema-financas-pessoais

# 2. Instale as dependências PHP
composer install

# 3. Configure o ambiente
cp .env.example .env
php artisan key:generate
```

Edite o `.env` com seus dados MySQL:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3307
DB_DATABASE=financas_casa
DB_USERNAME=root
DB_PASSWORD=
```

```bash
# 4. Crie o banco de dados
mysql -u root -P 3307 -e "CREATE DATABASE financas_casa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 5. Rode as migrations e o seed
php artisan migrate --seed

# 6. Inicie o servidor
php artisan serve
```

Acesse: **http://127.0.0.1:8000**

> ⚠️ Com o **Laragon**, basta apontar o virtual host para a pasta `public/` e acessar **http://sistema-financas-pessoais.test**

---

## 🔑 Usuário de demonstração

| Campo | Valor |
|-------|-------|
| E-mail | `casa@financas.com` |
| Senha | `password` |

---

## 🧱 Estrutura do Projeto

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

config/financial.php               # Categorias e meses em PT-BR
database/migrations/               # Tabelas: users + financial_entries
resources/views/
├── layouts/app.blade.php
├── auth/login.blade.php
└── financial/
    ├── dashboard.blade.php
    └── partials/
public/js/financial.js             # Chart.js, fetch status, SweetAlert2
```

---

## 📝 Melhorias Futuras

- [ ] Relatório em PDF por mês
- [ ] Exportar para Excel/CSV
- [ ] Suporte a múltiplos usuários por família (grupos)
- [ ] Metas de economia mensais
- [ ] Notificações de contas a vencer
- [ ] App mobile (PWA)

---

## 🔗 Publicar no GitHub

```bash
git remote add origin https://github.com/omartins-zs/sistema-financas-pessoais.git
git branch -M master
git push -u origin master

# Publicar também a branch do GitHub Pages
git push origin github-pages
```

---

<div align="center">

Feito com ❤️ por **Gabriel Martins** 🚀

</div>
