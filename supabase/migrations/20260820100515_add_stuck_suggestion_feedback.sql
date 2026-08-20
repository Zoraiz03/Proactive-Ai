-- Detector preferences and the suggestion feedback history used to adapt them.
-- All three tables are exposed through the Data API, protected by ownership RLS.

create table public.stuck_detection_settings (
  user_id             uuid primary key references auth.users on delete cascade,
  preset              text not null default 'medium'
                      check (preset in ('low', 'medium', 'high')),
  overrides           jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(overrides) = 'object'),
  adaptive_overrides  jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(adaptive_overrides) = 'object'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.suggestions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  provider           text not null
                     check (provider in ('gemini','openai','deepseek','anthropic','demo')),
  file_name          text not null,
  detector_metadata  jsonb not null
                     check (jsonb_typeof(detector_metadata) = 'object'),
  score              numeric(5,2) not null check (score >= 0),
  explanation        text not null,
  snippet            text not null default '',
  reason             text not null,
  created_at         timestamptz not null default now(),
  unique (id, user_id)
);

create index suggestions_user_created_idx
  on public.suggestions (user_id, created_at desc);

create table public.suggestion_outcomes (
  id                 uuid primary key default gen_random_uuid(),
  suggestion_id      uuid not null,
  user_id            uuid not null references auth.users on delete cascade,
  outcome            text not null check (outcome in ('accepted', 'dismissed')),
  detector_types     text[] not null,
  detector_metadata  jsonb not null
                     check (jsonb_typeof(detector_metadata) = 'object'),
  created_at         timestamptz not null default now(),
  unique (suggestion_id),
  foreign key (suggestion_id, user_id)
    references public.suggestions (id, user_id) on delete cascade,
  check (
    detector_types <@ array[
      'repeated_edit', 'repeated_error', 'cursor_thrashing'
    ]::text[]
  )
);

create index suggestion_outcomes_user_created_idx
  on public.suggestion_outcomes (user_id, created_at desc);

alter table public.stuck_detection_settings enable row level security;
alter table public.suggestions enable row level security;
alter table public.suggestion_outcomes enable row level security;

create policy "stuck settings: read own row"
  on public.stuck_detection_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "stuck settings: insert own row"
  on public.stuck_detection_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "stuck settings: update own row"
  on public.stuck_detection_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "suggestions: read own rows"
  on public.suggestions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "suggestions: insert own rows"
  on public.suggestions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "suggestion outcomes: read own rows"
  on public.suggestion_outcomes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "suggestion outcomes: insert own rows"
  on public.suggestion_outcomes for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.stuck_detection_settings to authenticated;
grant select, insert on public.suggestions to authenticated;
grant select, insert on public.suggestion_outcomes to authenticated;

grant select, insert, update, delete on public.stuck_detection_settings to service_role;
grant select, insert, update, delete on public.suggestions to service_role;
grant select, insert, update, delete on public.suggestion_outcomes to service_role;
