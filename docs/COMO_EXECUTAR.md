# Como Executar — Finanças da Casa

Escolha **um** guia conforme seu ambiente:

| Guia | Quando usar |
| --- | --- |
| **[COMO_EXECUTAR_LOCAL.md](COMO_EXECUTAR_LOCAL.md)** | Laragon, XAMPP ou `php artisan serve` (MySQL local, sem Docker) |
| **[COMO_EXECUTAR_DOCKER.md](COMO_EXECUTAR_DOCKER.md)** | Docker Desktop (Nginx + PHP-FPM + MySQL + PHPMyAdmin) |

---

## Início rápido

### Local (Laragon)

```bash
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

→ http://127.0.0.1:8000

> **Requisitos:** PHP **8.4+**, Composer, MySQL (Laragon na porta **3307**). Crie o banco `financas_casa` antes das migrations.

### Docker

```bash
cp .env.docker.example .env
docker compose up -d --build
docker compose exec app composer install
docker compose exec app php artisan key:generate
docker compose exec app php artisan migrate --seed
docker compose exec app php artisan config:cache
```

→ http://localhost:8080

> Detalhes completos, portas e diagnóstico: [COMO_EXECUTAR_DOCKER.md](COMO_EXECUTAR_DOCKER.md)

---

## Logins demo

Usuário criado pelo seeder `DatabaseSeeder`:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Finanças da Casa | casa@financas.com | password |

O seeder também popula o mês atual com lançamentos de exemplo (salário, aluguel, mercado, luz).

---

## Outros documentos

- [COMO_EXECUTAR_LOCAL.md](COMO_EXECUTAR_LOCAL.md) — Passo a passo no Laragon / ambiente local
- [COMO_EXECUTAR_DOCKER.md](COMO_EXECUTAR_DOCKER.md) — Stack Docker completa
- [PERFORMANCE_DOCKER.md](PERFORMANCE_DOCKER.md) — Otimizações de performance Docker
