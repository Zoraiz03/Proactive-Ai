-- Table-level privileges. RLS decides WHICH rows a role may touch, but the
-- role still needs the base SQL grant to touch the table at all. Tables made
-- in a migration don't get these automatically.

grant usage on schema public to anon, authenticated, service_role;

-- Signed-in users operate on their own profile and files (RLS scopes to own rows).
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.files    to authenticated;

-- api_keys is intentionally NOT granted to anon/authenticated. Only the
-- service-role client (which bypasses RLS) may read/write it.

-- service_role needs base table grants too (it bypasses RLS, not SQL grants).
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.files    to service_role;
grant select, insert, update, delete on public.api_keys to service_role;
