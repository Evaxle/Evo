#!/usr/bin/env bash
set -euo pipefail
# Usage: ./run-php-admin.sh [USERNAME] [PASSWORD_OR_HASH]
# If PASSWORD_OR_HASH begins with '$' it will be treated as a password hash.

USER_ARG=${1:-evaxle}
PASS_ARG=${2:-295jg8a023v}

export PHP_ADMIN_USER="$USER_ARG"
export PHP_ADMIN_PASS="$PASS_ARG"

cd "$(dirname "$0")/.."

echo "Starting PHP built-in server for DB admin"
echo "Admin URL: http://127.0.0.1:8001/dbadmin.php"
echo "PHP_ADMIN_USER=$PHP_ADMIN_USER"
echo "(default credentials: user=evaxle password=295jg8a023v)"

php -S 127.0.0.1:8001 -t public
