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

## Security / next steps

Security / next steps:
- Use secure cookies (HttpOnly, Secure) instead of localStorage for tokens in production.
- Add email verification, rate limiting, and stronger password policies.
- Add tests.
