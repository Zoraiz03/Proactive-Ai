-- Keep the opt-in nudge preference alongside the existing detector settings.
-- Existing and new users default to proactive help being enabled.
alter table public.stuck_detection_settings
  add column proactive_help_enabled boolean not null default true;
