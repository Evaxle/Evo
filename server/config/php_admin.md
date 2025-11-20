# PHP DB Admin — README

This page explains how to run the bundled PHP admin page and how to secure it.

Files:
- `server/public/dbadmin.php` — the admin UI (requires a PHP-capable server to execute).
- `server/config/php_admin.php` — credentials; supports reading from environment variables.
- `server/bin/run-php-admin.sh` — helper to run PHP built-in server for local use.

Important notes:
- Node/Express static hosting will not execute PHP files — it will serve them as plain text.
  To use `dbadmin.php` you must run a PHP server (PHP built-in server, Apache, or Nginx+PHP-FPM).
- Do NOT commit real passwords into source. Use environment variables or password hashes.

Quick start (local):

1. From the project root, make the helper executable:

```bash
chmod +x server/bin/run-php-admin.sh
```

2. Generate a password hash (recommended) — run this in PHP CLI and copy the output:

```bash
php -r "echo password_hash('YourStrongPasswordHere', PASSWORD_DEFAULT).PHP_EOL;"
```

3. Start the PHP server with the hashed password (example):

```bash
# replace the second argument with the hash printed from the previous command
./server/bin/run-php-admin.sh admin '$2y$...'
```

4. Open the admin in your browser: `http://127.0.0.1:8001/dbadmin.php`

If you prefer to set environment variables explicitly, you can run:

```bash
cd server
export PHP_ADMIN_USER=admin
export PHP_ADMIN_PASS='$2y$...'
php -S 127.0.0.1:8001 -t public
```

If you must use a plaintext password (not recommended), you can pass it directly as the second argument to the helper script — but prefer a hashed password and `PHP_ADMIN_PASS` starting with `$` so the PHP script uses `password_verify()`.

Setting the SQLite DB path (optional):

```bash
export SQLITE_DB_PATH=/path/to/evo.db
# then run the PHP server as above
```

Security recommendations:
- Use a strong password or password hash.
- Do not expose this admin endpoint to the public internet. Bind to `127.0.0.1` or firewall the port.
- Consider removing/renaming `dbadmin.php` in production or protecting access via webserver controls (IP allowlist, additional auth, VPN).
