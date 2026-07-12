-- Proactive AI Workspace — initial schema (Supabase / Postgres)
-- Auth users live in the managed auth.users table. Everything below is
-- keyed to auth.uid() and locked down with Row Level Security.

-- ---------------------------------------------------------------------------
-- profiles: one row per user (name, pause preference, role)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  name          text not null default '',
  pause_seconds smallint not null default 5,
  role          text not null default 'user' check (role in ('user', 'admin')),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- api_keys: encrypted per-provider AI keys. NB: intentionally NO select
-- policy — the browser must never read these. Only the server (service-role,
-- which bypasses RLS) touches this table.
-- ---------------------------------------------------------------------------
create table public.api_keys (
  user_id       uuid not null references auth.users on delete cascade,
  provider      text not null check (provider in ('gemini','openai','deepseek','anthropic')),
  encrypted_key text not null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, provider)
);

-- ---------------------------------------------------------------------------
-- files: user documents and code files
-- ---------------------------------------------------------------------------
create table public.files (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  content    text not null default '',
  updated_at timestamptz not null default now()
);
create index files_user_id_idx on public.files (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.api_keys enable row level security;
alter table public.files    enable row level security;

-- profiles: a user reads and writes only their own row
create policy "profiles: own row" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- files: a user reads and writes only their own files
create policy "files: own rows" on public.files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- api_keys: deliberately NO policy. RLS on + no policy = clients get nothing.
-- The server uses the service-role key (bypasses RLS) for all key access.

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up.
-- The name/pause_seconds come from the signup metadata the client passes.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, pause_seconds)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce((new.raw_user_meta_data ->> 'pause_seconds')::smallint, 5)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
