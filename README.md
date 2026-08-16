# Evo

A VSCode-like IDE that runs entirely in your browser. Built with TypeScript, Vite, the Monaco editor (the same engine VS Code uses) and Supabase for accounts and cloud syncing.

## Features

- **Full IDE layout** — title bar, activity bar, sidebar, tab strip, editor, and status bar, styled after VS Code's Dark+ theme
- **Monaco editor** — syntax highlighting, IntelliSense, bracket matching, minimap and multi-language support
- **Accounts** — sign up/sign in with a username + password, or sign in with your GitHub account (Supabase GitHub OAuth)
- **Cloud saving** — every project, file edit, open tab and setting is autosaved to your account and restored on any device
- **Home dashboard** — browse, create, rename and delete your projects, open local folders, and open GitHub repositories
- **GitHub integration** — sign in with GitHub, load any repository as a workspace, edit files, and commit & push from the Source Control panel
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
5. Sign-in uses a synthetic `<username>@evo.test` email (an RFC 2606 reserved TLD that passes Supabase's email validation). You must have "Confirm email" **OFF** — no real email is ever sent.

## Setup: GitHub (sign in + load repos + commit)

GitHub sign-in uses **Supabase's GitHub OAuth provider**. The token Supabase returns
includes the `repo` scope (requested by the app), so you can load repositories,
edit files and commit & push from Evo.

1. At [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps → New OAuth App**.
2. Name it "Evo"; set the **Homepage URL** to your app URL (e.g. your Vercel URL).
3. Set the **Authorization callback URL** to your Supabase Auth callback:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and generate a **Client Secret**.
5. In the Supabase dashboard → **Authentication → Providers → GitHub**:
   - Turn GitHub **on**
   - Paste the Client ID and Client Secret
   - Save (note the displayed **Redirect URL** and make sure it matches the callback URL configured on the GitHub app)
6. Sign out/in to test. On the Home screen, GitHub users see a **GitHub** section with their repositories to open; regular username/password accounts see no GitHub UI.

> The old `VITE_GITHUB_CLIENT_ID` env var (used for device-flow linking) is no longer required and can be removed.

## Setup: Vercel

Add these environment variables to the project (Settings → Environment Variables):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://apwfcxwklmfyjymbacnv.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your anon public key |

Then redeploy. `vercel.json` is already configured to build with Vite and serve `dist/`.

## How data flows

- **Signed out (guest):** workspaces, tabs and settings live in IndexedDB on the current device.
- **Signed in:** the same data is mirrored to Supabase (projects table stores the whole file tree as JSON, debounced ~800ms after each edit). Opening Evo from any device restores your projects, tabs and settings.

## Deploy

`vercel.json` handles Vercel deploys; `Dockerfile` ships a static nginx image for other hosts.
