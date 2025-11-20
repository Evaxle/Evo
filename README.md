# Evo

This adds a simple user creation / authentication system using the existing `server/data/evo.db` (SQLite).

## What I added
- `server/index.js` — Express API with endpoints: `/api/signup`, `/api/signin`, `/api/me`, and `/api/me/data`.
- `server/db/sqlite.js` — uses the existing `server/data/evo.db` for user storage.
Note: This repository now uses SQLite only. MongoDB-related files were removed or deprecated.
- `server/public/signup.html` and `server/public/signin.html` — minimal frontend pages that call the API and store a JWT in localStorage.
- `server/package.json` — dependencies and scripts.

## Running locally (SQLite)

1. Install dependencies:

```bash
cd server
npm install
```

2. Start the server (it will use `server/data/evo.db`):

```bash
npm run dev
```

3. Open `http://localhost:3000/signup.html` or `signin.html` to try the flows.

## Running on a local machine (SQLite)

The server uses the SQLite database file at `server/data/evo.db` by default. If that file is read-only, you can point the server at a writable copy using the `SQLITE_DB_PATH` environment variable. Example:

```bash
# start server using a local writable DB file
SQLITE_DB_PATH=/full/path/to/evo_local.db npm start
```

Make sure to set `JWT_SECRET` in production.

## Optional: Use Vercel / Turso (libSQL) instead of local sqlite

This project can be configured to use a Turso-hosted database (a hosted
SQLite-compatible server) via the `@libsql/client` library. When using Turso
you should store the connection URL and token in environment variables.

- Locally: put these in `.env.local` (or your shell env):
	- `TURSO_URL` — the libSQL/Turso URL
	- `TURSO_TOKEN` — the token (if your database requires authentication)

- On Vercel: open the Project Settings -> Environment Variables and add
	`TURSO_URL` and `TURSO_TOKEN` (or `LIBSQL_URL` / `LIBSQL_TOKEN`) for the
	appropriate environment (Preview/Production).

Example Next.js API usage (in your Next app):

```js
// pages/api/users.js
import { createClient } from '@libsql/client';

const client = createClient({ url: process.env.TURSO_URL, auth: { token: process.env.TURSO_TOKEN } });

export default async function handler(req, res) {
	const rows = await client.execute('SELECT id, email, name FROM users');
	res.json(rows);
}
```

Notes:
- Keep secrets in Vercel environment variables. Do NOT commit tokens to git.
- This repo includes `server/db/turso.js` which shows a minimal adapter
	(`init`, `execute`, `findUserByEmail`, `createUser`) for use from the
	Express server. Extend it to fully replace `server/db/sqlite.js` functions.

## Security / next steps

Security / next steps:
- Use secure cookies (HttpOnly, Secure) instead of localStorage for tokens in production.
- Add email verification, rate limiting, and stronger password policies.
- Add tests.
