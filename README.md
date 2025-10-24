# Evo

This repository contains a prototype for Evo — a browser-based code editor and project manager.

What was added in this scaffold:

- `server/` — Express backend with auth (register/login via JWT) and project CRUD stored in SQLite.
- `client/` — Static client with `index.html`, `editor.html`, `script.js`, and SCSS/CSS.
- `docker-compose.yml` — bring up the server (serves the client statically) and persists the SQLite DB.
- `.gitignore` and `server/.env.example`.

Quick start (local):

1. Run server locally

	cd server
	npm install
	PORT=3000 JWT_SECRET=your_secret node index.js

2. Run with Docker Compose

	docker compose up --build

Notes & next steps:

- This is a scaffold and prototype. Full GitHub OAuth integration, Codespaces access, account storage and advanced editor features (Monaco editor, file tree, terminals) require additional work and credentials.
- Use this scaffold as a starting point: extend the client, replace the quick textarea editor with Monaco or CodeMirror, and add GitHub OAuth and integration flows.
