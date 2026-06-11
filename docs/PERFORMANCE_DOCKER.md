# Performance Docker — Finanças da Casa

Auditoria e otimizações aplicadas para ambiente **Docker Desktop + Windows + bind mount**.

---

## Gargalos identificados (antes)

| Área | Problema | Impacto |
| --- | --- | --- |
| **APP_DEBUG** | `true` no compose | Overhead de debug bar, queries logadas, respostas mais lentas |
| **Sessão / cache** | `database` (MySQL) | I/O extra a cada request; pior com Livewire (muitas requisições) |
| **Framework cache** | Sem `config/route/view` cache | Laravel recompila config e rotas a cada request |
| **PHP-FPM** | Pool padrão (`pm.max_children` baixo) | Risco de fila e lentidão entre telas |
| **OPcache** | Sem JIT; pouca memória | Menos bytecode em memória |
| **realpath_cache** | Padrão PHP | Muitos `stat()` no volume Windows |
| **Nginx** | `fastcgi_pass app:9000` estático | **502** após `docker compose up --force-recreate app` (IP antigo) |
| **Bind mount** | Volume padrão no Windows | I/O lento em `vendor/`, `storage/`, views compiladas |
| **Bootstrap** | PHP-FPM subia sem esperar deps | Falhas intermitentes e retries lentos |

---

## Alterações aplicadas

### Laravel / runtime
- `APP_DEBUG=false` e `LOG_LEVEL=warning` no `docker-compose.yml`
- Aquecimento inteligente de cache em `docker/scripts/start-app.sh` (só se ausente)

### Sessão e cache
- Container **Redis 7** adicionado
- Extensão **phpredis** instalada no Dockerfile
- `SESSION_DRIVER=redis`, `CACHE_STORE=redis`, `QUEUE_CONNECTION=redis`

### PHP-FPM
- `docker/php/fpm-performance.conf` — pool dinâmico até 20 workers

### PHP ini / OPcache
- `docker/php/local.ini` — `realpath_cache`, timezone, limites
- `docker/php/opcache.ini` — 192 MB, JIT, `validate_timestamps=0` (performance no bind mount)

### Nginx
- `resolver 127.0.0.11` + variável `$upstream` — evita 502 após recreate do `app`
- Buffers e timeouts FastCGI ajustados

### Docker Compose
- Volume `:cached` no bind mount (Windows)
- MySQL com buffer pool reduzido para dev
- Redis sem persistência (dev)
- Healthchecks em `mysql`, `redis` e `app`

---

## Arquivos modificados / criados

```
docker/nginx/default.conf          (resolver dinâmico, buffers)
docker/php/local.ini               (novo)
docker/php/fpm-performance.conf    (novo)
docker/php/opcache.ini             (JIT, mais memória)
docker/scripts/start-app.sh        (bootstrap inteligente)
docker-compose.yml                 (redis, env perf, :cached)
Dockerfile                         (phpredis, configs)
.env.docker.example                (redis, APP_DEBUG=false)
docs/PERFORMANCE_DOCKER.md         (este arquivo)
```

---

## Comandos úteis

```bash
# Subir com perf otimizado
cp .env.docker.example .env
docker compose up -d --build

# Limpar caches após mudar .env ou config/
docker compose exec app php artisan optimize:clear

# Forçar re-aquecimento no próximo restart
docker compose exec app rm -f bootstrap/cache/config.php bootstrap/cache/routes*.php
docker compose restart app

# Ver OPcache / FPM
docker compose exec app php -i | grep opcache
docker compose exec app php-fpm -tt 2>&1 | head -20
```

---

## Limitações honestas (Windows + Docker Desktop)

1. **Bind mount continua lento** — `:cached` ajuda, mas `vendor/` e `storage/` no host ainda penalizam. Cold start da 1ª request após restart pode levar alguns segundos.
2. **OPcache `validate_timestamps=0`** — mudanças em arquivos `.php` exigem `docker compose restart app` para refletir.
3. **Cache Laravel** — após alterar `.env` ou `config/`, rode `optimize:clear` ou apague `bootstrap/cache/*.php`.
4. **Portas 8080/3308** — se outro projeto Docker usar as mesmas portas, pare-o antes (`docker ps`).
5. **Livewire** — cada interação gera requests HTTP; Redis + FPM tuning reduzem, mas não eliminam o custo do bind mount no Windows.

---

## Validação (ambiente real — Docker Desktop Windows)

| Métrica | Antes (estimado) | Depois (pós-aquecimento) |
| --- | --- | --- |
| `/login` warm | 2–5s+ (debug + DB session) | **~0,08–0,13s** HTTP 200 |
| `/` redirect | lento | **~0,15s** HTTP 302 |
| Config/Route/View cache | ausente | **CACHED** |
| Session/Cache driver | database (MySQL) | **redis** |
| Debug Mode | ON | **OFF** |
| 502 após recreate app | provável (DNS estático) | **resolvido** (resolver dinâmico) |

Cold start (1ª request após `docker compose up`): ainda pode levar **2–15s** no Windows por bind mount + compilação Livewire — comportamento esperado.
