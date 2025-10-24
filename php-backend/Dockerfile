FROM php:8.2-apache

RUN apt-get update && apt-get install -y \
    libzip-dev \
    libsqlite3-dev \
    pkg-config \
    unzip \
    git \
    curl \
    && docker-php-ext-install pdo pdo_sqlite

COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html
RUN a2enmod rewrite

EXPOSE 80

CMD ["apache2-foreground"]
