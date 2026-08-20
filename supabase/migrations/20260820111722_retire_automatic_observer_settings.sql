-- Retire preferences used exclusively by automatic suggestion triggers.
-- Suggestion and outcome history tables are deliberately preserved.

drop table if exists public.stuck_detection_settings;

alter table public.profiles
  drop column if exists pause_seconds;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', '')
  );
  return new;
end;
$$;
