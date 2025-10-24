Evo server

This is a minimal Express backend used by the Evo project scaffold.

Features:
- Register / login with JWT
- Projects CRUD stored in SQLite

Quick start (local):

1. Install dependencies

   npm install

2. Start server

   PORT=3000 JWT_SECRET=your_secret node index.js

The server serves the `client` directory statically if present.
