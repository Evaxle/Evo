# Evo

A VSCode-like IDE that runs entirely in your browser. Built with TypeScript, Vite, the Monaco editor (the same engine VS Code uses) and Supabase for accounts and cloud syncing.

## Features

- **Full IDE layout** — title bar, activity bar, sidebar, tab strip, editor, and status bar, styled after VS Code's Dark+ theme
- **Monaco editor** — syntax highlighting, IntelliSense, bracket matching, minimap and multi-language support
- **Accounts** — simple username + password sign up/sign in (no email needed) powered by Supabase Auth
- **Cloud saving** — every project, file edit, open tab and setting is autosaved to your account and restored on any device
- **Home dashboard** — browse, create, rename and delete your projects, open local folders, and link GitHub
- **GitHub integration** — link your GitHub account (device-flow OAuth), load any repository as a workspace, edit files, and commit & push from the Source Control panel
- **File explorer** — create, rename, delete, duplicate and move files/folders, with drag & drop
- **Tab system** — dirty indicators, middle-click close, close others/all
- **Workspaces** — guest users get local (IndexedDB) workspaces; signed-in users get cloud projects
- **Command Palette** (`Ctrl+Shift+P`), **Quick Open** (`Ctrl+P`), **Search** (`Ctrl+Shift+F`), **Settings** (`Ctrl+,`)
- **HTML & Markdown preview**

## Getting started (development)

```bash
npm install
cp .env.example .env.local   # add your Supabase + GitHub values
npm run dev                  # http://localhost:3000
npm run build                # typecheck + production build into dist/
```

## Setup: Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the SQL in `supabase/schema.sql` in the **SQL editor** (creates `profiles`, `projects`, `settings`, `editor_state` with row-level security).
3. **Auth → Providers → Email**: turn **OFF** "Confirm email" so username/password sign-up logs users straight in.
4. **Project Settings → API**: copy the project URL and `anon` public key.

## Setup: GitHub (load repos + commit)

1. At [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps → New OAuth App**.
2. Name it "Evo"; the **Homepage URL** can be your Vercel URL; the **Authorization callback URL** can be anything (device flow is used, so a real callback isn't required).
3. Copy the **Client ID**. No client secret is needed for device flow.

## Setup: Vercel

Add these environment variables to the project (Settings → Environment Variables):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth App client id |

Then redeploy. `vercel.json` is already configured to build with Vite and serve `dist/`.

## How data flows

- **Signed out (guest):** workspaces, tabs and settings live in IndexedDB on the current device.
- **Signed in:** the same data is mirrored to Supabase (projects table stores the whole file tree as JSON, debounced ~800ms after each edit). Opening Evo from any device restores your projects, tabs and settings.

## Deploy

`vercel.json` handles Vercel deploys; `Dockerfile` ships a static nginx image for other hosts.
