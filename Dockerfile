# syntax=docker/dockerfile:1

# =========================================================
#  fpm — PHP 8.4-FPM para desenvolvimento (docker-compose)
# =========================================================
FROM php:8.4-fpm-alpine AS fpm

RUN apk add --no-cache \
        bash \
        git \
        unzip \
        nodejs \
        npm \
        ca-certificates \
        libzip-dev \
        $PHPIZE_DEPS \
    && docker-php-ext-install pdo_mysql bcmath opcache zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV COMPOSER_PROCESS_TIMEOUT=600 \
    COMPOSER_NO_INTERACTION=1

WORKDIR /var/www/html

COPY docker/php/local.ini /usr/local/etc/php/conf.d/99-local.ini
COPY docker/php/opcache.ini /usr/local/etc/php/conf.d/opcache.ini
COPY docker/php/fpm-performance.conf /usr/local/etc/php-fpm.d/zz-performance.conf
COPY docker/scripts/start-app.sh /usr/local/bin/start-app.sh
RUN chmod +x /usr/local/bin/start-app.sh

EXPOSE 9000
CMD ["/usr/local/bin/start-app.sh"]

# =========================================================
#  app — imagem de produção (Render): Nginx + PHP-FPM + código
# =========================================================
FROM php:8.4-fpm-alpine AS app

RUN apk add --no-cache \
        bash \
        git \
        unzip \
        gettext \
        nginx \
        ca-certificates \
        libzip-dev \
        $PHPIZE_DEPS \
    && docker-php-ext-install pdo_mysql bcmath opcache zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV COMPOSER_PROCESS_TIMEOUT=600 \
    COMPOSER_NO_INTERACTION=1 \
    PORT=8080

WORKDIR /var/www/html

COPY docker/nginx/standalone.conf /etc/nginx/nginx.conf.template
COPY docker/php/local.ini /usr/local/etc/php/conf.d/99-local.ini
COPY docker/php/opcache.ini /usr/local/etc/php/conf.d/opcache.ini
COPY docker/php/fpm-performance.conf /usr/local/etc/php-fpm.d/zz-performance.conf
COPY docker/php/start-production.sh /usr/local/bin/start-production.sh
RUN chmod +x /usr/local/bin/start-production.sh

COPY composer.json composer.lock ./
RUN for i in 1 2 3 4 5; do \
        composer install --no-dev --optimize-autoloader --no-scripts --prefer-dist \
            && break; \
        echo ">> Tentativa $i do composer falhou, aguardando..."; \
        sleep 8; \
    done

COPY . .

RUN composer dump-autoload --optimize --no-dev \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

EXPOSE 8080
CMD ["/usr/local/bin/start-production.sh"]
