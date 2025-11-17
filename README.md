# Evo — User creation example

This adds a simple user creation / authentication system using the existing `server/data/evo.db` (SQLite) by default, and an optional MongoDB backend for deployment on Vercel using the Vercel Storage MongoDB integration.

## What I added
- `server/index.js` — Express API with endpoints: `/api/signup`, `/api/signin`, `/api/me`, and `/api/me/data`.
- `server/db/sqlite.js` — uses the existing `server/data/evo.db` for user storage.
- `server/db/mongo.js` — MongoDB-backed implementation (used when `MONGODB_URI` is provided).
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

## Deploying on Vercel with MongoDB (Vercel Storage)

If you want to use Vercel's MongoDB storage, configure an environment variable in your Vercel Project settings named `MONGODB_URI` with the connection string provided by the Vercel Storage MongoDB integration. Example env var name: `MONGODB_URI`.

Also set `JWT_SECRET` to a secure random value in Vercel's environment variables.

The server will automatically switch to MongoDB when `MONGODB_URI` is present.

Notes:
- The MongoDB module stores user IDs as ObjectId strings. Tokens contain `id` (string) and `email`.
- You can keep using the static `signup.html` and `signin.html` pages as-is (they POST to `/api/*`). On Vercel, consider using Next.js or serverless functions for tighter integration.

## Security / next steps

- Use secure cookies (HttpOnly, Secure) instead of localStorage for tokens in production.
- Add email verification, rate limiting, and stronger password policies.
- Add tests.
