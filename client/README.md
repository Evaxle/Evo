Evo client (prototype)

This is a minimal static client used by the Evo scaffold. It includes:

- `index.html` — main app with register/login, project list and a quick editor placeholder
- `editor.html` — simple editor UI for a single project
- `script.js` — client logic for auth, projects and editor
- `styles.scss` — SCSS source (you can compile with `npm run build-css`)

To build CSS locally:

1. cd client
2. npm install
3. npm run build-css

Then open `index.html` in your browser or run the server to serve the `client` folder.
