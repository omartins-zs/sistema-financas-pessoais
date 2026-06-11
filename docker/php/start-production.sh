#!/usr/bin/env bash
set -e

export PORT="${PORT:-8080}"
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

cd /var/www/html

chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true

if [ "${APP_ENV}" = "production" ]; then
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
else
    php artisan config:clear || true
    php artisan route:clear || true
    php artisan view:clear || true
fi

php artisan migrate --force || echo "Aviso: migrate falhou. Continuando..."

php-fpm -D
exec nginx -g 'daemon off;'
