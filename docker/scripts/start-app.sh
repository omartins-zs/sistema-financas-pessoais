#!/usr/bin/env bash
set -euo pipefail

cd /var/www/html

# Permissoes rapidas (sem chown recursivo pesado no bind mount Windows)
chmod -R 775 storage bootstrap/cache 2>/dev/null || true

wait_for_mysql() {
    echo ">> Aguardando MySQL..."
    for _ in $(seq 1 45); do
        if php -r "
            \$host = getenv('DB_HOST') ?: 'mysql';
            \$port = getenv('DB_PORT') ?: '3306';
            \$user = getenv('DB_USERNAME') ?: 'root';
            \$pass = getenv('DB_PASSWORD') ?: '';
            \$db   = getenv('DB_DATABASE') ?: '';
            try {
                new PDO(
                    \"mysql:host={\$host};port={\$port};dbname={\$db}\",
                    \$user,
                    \$pass,
                    [PDO::ATTR_TIMEOUT => 2]
                );
                exit(0);
            } catch (Throwable \$e) {
                exit(1);
            }
        " 2>/dev/null; then
            echo ">> MySQL disponivel."
            return 0
        fi
        sleep 1
    done
    echo ">> Aviso: MySQL nao respondeu a tempo. Subindo PHP-FPM mesmo assim."
}

wait_for_redis() {
    echo ">> Aguardando Redis..."
    for _ in $(seq 1 20); do
        if php -r "
            \$host = getenv('REDIS_HOST') ?: 'redis';
            \$port = (int) (getenv('REDIS_PORT') ?: 6379);
            try {
                \$r = new Redis();
                \$r->connect(\$host, \$port, 2);
                exit(\$r->ping() ? 0 : 1);
            } catch (Throwable \$e) {
                exit(1);
            }
        " 2>/dev/null; then
            echo ">> Redis disponivel."
            return 0
        fi
        sleep 1
    done
    echo ">> Aviso: Redis nao respondeu a tempo."
}

warm_laravel_cache() {
    if [ "${LARAVEL_WARM_CACHE:-true}" != "true" ]; then
        echo ">> Aquecimento de cache desabilitado (LARAVEL_WARM_CACHE=false)."
        return 0
    fi

    if [ -z "${APP_KEY:-}" ]; then
        echo ">> APP_KEY ausente — pulando cache (rode: php artisan key:generate)."
        return 0
    fi

    echo ">> Aquecendo caches Laravel (somente se ausentes)..."

    if [ ! -f bootstrap/cache/config.php ]; then
        php artisan config:cache --quiet 2>/dev/null && echo "   config:cache OK" || true
    fi

    if [ ! -f bootstrap/cache/routes-v7.php ] && [ ! -f bootstrap/cache/routes.php ]; then
        php artisan route:cache --quiet 2>/dev/null && echo "   route:cache OK" || true
    fi

    # view:cache e lento em bind mount; roda so se ainda nao houver views compiladas
    if [ -z "$(ls -A storage/framework/views 2>/dev/null)" ]; then
        php artisan view:cache --quiet 2>/dev/null && echo "   view:cache OK" || true
    fi
}

# --- bootstrap ---
wait_for_mysql

if [ "${SESSION_DRIVER:-}" = "redis" ] || [ "${CACHE_STORE:-}" = "redis" ] || [ "${QUEUE_CONNECTION:-}" = "redis" ]; then
    wait_for_redis
fi

warm_laravel_cache

echo ">> Iniciando PHP-FPM..."
exec php-fpm -F
