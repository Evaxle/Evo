-- Evo database schema
-- Run this in the Supabase SQL editor once.

-- Usernames are stored as profiles keyed by the Supabase auth user id.
-- Sign-in uses a synthetic email derived from the username
-- (`<username>@evo.test`, RFC 2606 reserved TLD) so the form only needs
-- username + password.

-- 1. Profiles (one row per user)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  email text unique not null,
  github_token text,
  github_username text,
  created_at timestamptz not null default now()
);

-- 2. Projects (the full file tree is stored as JSON)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  folder_name text not null default 'evo-workspace',
  root jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. User settings
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings jsonb,
  updated_at timestamptz not null default now()
);

-- 4. Open editor tabs per project
create table if not exists public.editor_state (
  project_id uuid primary key references public.projects (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tabs jsonb,
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists projects_user_idx on public.projects (user_id);
create index if not exists editor_state_user_idx on public.editor_state (user_id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated
  before update on public.settings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_editor_state_updated on public.editor_state;
create trigger trg_editor_state_updated
  before update on public.editor_state
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.settings enable row level security;
alter table public.editor_state enable row level security;

-- Users can read/update their own profile (used to store the GitHub token)
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Projects are fully owned by their creator
create policy "projects_all_own" on public.projects
  for all using (auth.uid() = user_id);

create policy "settings_all_own" on public.settings
  for all using (auth.uid() = user_id);

create policy "editor_state_all_own" on public.editor_state
  for all using (auth.uid() = user_id);
