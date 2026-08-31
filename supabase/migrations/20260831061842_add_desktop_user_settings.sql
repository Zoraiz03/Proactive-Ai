create table public.desktop_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_provider text not null default 'gemini' check (preferred_provider in ('gemini', 'openai', 'deepseek', 'anthropic', 'demo')),
  preferred_model text not null default 'gemini-2.5-flash' check (preferred_model in ('gemini-2.5-flash', 'gpt-4o-mini', 'deepseek-chat', 'claude-haiku-4-5-20251001', 'demo-local')),
  observer_enabled boolean not null default true,
  default_observer_action text not null default 'explain' check (default_observer_action in ('explain', 'fix_error', 'improve_code', 'continue_code', 'generate_tests')),
  show_context_preview boolean not null default true,
  include_diagnostics boolean not null default true,
  include_terminal_error boolean not null default false,
  maximum_context_chars integer not null default 20000 check (maximum_context_chars between 1000 and 50000),
  confirm_complete_file boolean not null default true,
  store_suggestion_history boolean not null default true,
  updated_at timestamptz not null default now(),
  check (
    (preferred_provider = 'gemini' and preferred_model = 'gemini-2.5-flash') or
    (preferred_provider = 'openai' and preferred_model = 'gpt-4o-mini') or
    (preferred_provider = 'deepseek' and preferred_model = 'deepseek-chat') or
    (preferred_provider = 'anthropic' and preferred_model = 'claude-haiku-4-5-20251001') or
    (preferred_provider = 'demo' and preferred_model = 'demo-local')
  )
);

alter table public.desktop_user_settings enable row level security;

revoke all on table public.desktop_user_settings from anon, authenticated;
grant select, insert, update, delete on table public.desktop_user_settings to authenticated;
grant all on table public.desktop_user_settings to service_role;

create policy "desktop settings select own"
  on public.desktop_user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "desktop settings insert own"
  on public.desktop_user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "desktop settings update own"
  on public.desktop_user_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "desktop settings delete own"
  on public.desktop_user_settings for delete to authenticated
  using ((select auth.uid()) = user_id);
