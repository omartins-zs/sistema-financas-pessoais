# Como Executar — Docker

Guia para subir o **Finanças da Casa** com Docker Desktop: Nginx, PHP-FPM, MySQL e PHPMyAdmin.

---

## Stack e containers

O `docker-compose.yml` define quatro serviços:

| Container | Função | Porta no host |
| --- | --- | --- |
| **nginx** | Servidor web (proxy para PHP-FPM) | **8080** → 80 |
| **app** | Laravel em PHP 8.4-FPM | 9000 (rede interna) |
| **mysql** | Banco MySQL 8.0 com volume persistente | **3308** → 3306 |
| **phpmyadmin** | Interface web para o banco | **8085** → 80 |
| **redis** | Sessão, cache e filas (performance) | rede interna |

> Otimizações de performance: [PERFORMANCE_DOCKER.md](PERFORMANCE_DOCKER.md)

O código do projeto é montado em `/var/www/html` no container **app** (bind mount). O **nginx** lê os arquivos estáticos e encaminha PHP para o **app** via FastCGI.

A imagem **app** é construída a partir do estágio `fpm` do `Dockerfile` (PHP 8.4, extensões Laravel, Composer e Node/npm para build opcional).

---

## 1) Preparar ambiente

Copie o `.env` preparado para Docker:

```bash
cp .env.docker.example .env
```

No `.env`, use o bloco **DOCKER** (já vem configurado no exemplo):

```env
APP_LOCALE=pt_BR
APP_FALLBACK_LOCALE=pt_BR
APP_FAKER_LOCALE=pt_BR

# DOCKER — app conecta ao servico "mysql" na rede interna (porta 3306)
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=financas_casa
DB_USERNAME=financas
DB_PASSWORD=secret

# LOCAL — comente o bloco acima e descomente para Laragon
# DB_CONNECTION=mysql
# DB_HOST=127.0.0.1
# DB_PORT=3307
# DB_DATABASE=financas_casa
# DB_USERNAME=root
# DB_PASSWORD=
```

> **Importante:** dentro do Docker, `DB_HOST=mysql` e `DB_PORT=3306`. A porta **3308** é só para acessar o MySQL **do seu PC** (HeidiSQL, DBeaver, etc.).

Credenciais MySQL criadas pelo compose:

| Variável | Valor |
| --- | --- |
| Banco | `financas_casa` |
| Usuário | `financas` |
| Senha | `secret` |
| Root | `root` |

---

## 2) Subir containers

Build e start em segundo plano:

```bash
docker compose up -d --build
```

Verificar status:

```bash
docker compose ps
```

Todos devem estar `Up`; o **mysql** deve aparecer como `healthy`.

---

## 3) Inicialização e migrations

Instalar dependências PHP (dentro do container):

```bash
docker compose exec app composer install
```

Gerar chave da aplicação:

```bash
docker compose exec app php artisan key:generate
```

Criar tabelas e dados demo:

```bash
docker compose exec app php artisan migrate:fresh --seed
```

Build de front-end (opcional — o dashboard usa CDN; útil se alterar Vite):

```bash
docker compose exec app npm install
docker compose exec app npm run build
```

Link de storage (se passar a usar uploads públicos):

```bash
docker compose exec app php artisan storage:link
```

---

## 4) Desenvolvimento e cache

Limpar caches Laravel:

```bash
docker compose exec app php artisan optimize:clear
```

Recriar caches (produção):

```bash
docker compose exec app php artisan config:cache
docker compose exec app php artisan route:cache
docker compose exec app php artisan view:cache
```

Parar e remover containers (volume do banco é preservado):

```bash
docker compose down
```

Remover também o volume do MySQL (apaga todos os dados):

```bash
docker compose down -v
```

---

## 5) Acessos

| Recurso | URL |
| --- | --- |
| Aplicação | http://localhost:8080 |
| Login | http://localhost:8080/login |
| PHPMyAdmin | http://localhost:8085 |
| MySQL (host) | `127.0.0.1:3308` |

```txt
Painel Finanças da Casa
URL de login: http://localhost:8080/login
E-mail: casa@financas.com
Senha: password
```

**PHPMyAdmin** — login manual:

- Servidor: `mysql`
- Usuário: `financas`
- Senha: `secret`

---

## 6) Logs e diagnóstico

Logs de todos os containers:

```bash
docker compose logs -f
```

Logs apenas da aplicação PHP:

```bash
docker compose exec app php artisan about
```

Logs do Nginx:

```bash
docker compose logs -f nginx
```

Entrar no container da aplicação:

```bash
docker compose exec app sh
```

---

## Problemas comuns

| Sintoma | Solução |
| --- | --- |
| Porta 8080, 3308 ou 8085 em uso | Pare outros containers Docker que usem as mesmas portas (ex.: `docker ps`) ou altere o mapeamento no `docker-compose.yml` |
| `Connection refused` ao MySQL | Aguarde o mysql ficar `healthy`: `docker compose ps` |
| Erro de permissão em `storage/` | `docker compose exec app chmod -R 775 storage bootstrap/cache` |
| Mudanças no `.env` não aplicam | `docker compose exec app php artisan config:clear` e reinicie: `docker compose restart app nginx` |
| Build lento no Windows | Normal na primeira vez; camadas seguintes usam cache |

---

## Deploy em produção (Render / PaaS)

Para hospedagem em nuvem, use o estágio **`app`** do `Dockerfile` (Nginx + PHP-FPM em um único container):

```bash
docker build --target app -t financas-casa .
```

Configure variáveis de ambiente de produção (`APP_ENV=production`, `APP_DEBUG=false`, credenciais do banco gerenciado) no painel do provedor.
