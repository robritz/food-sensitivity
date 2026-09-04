-- Addresses Supabase security linter warnings:
--
-- 1. `current_household_id`, `household_has_caregiver`, and
--    `household_has_pending_invite` are SECURITY DEFINER helper functions
--    meant only to be called from within RLS policies (as `authenticated`).
--    Every new Postgres function is EXECUTE-granted to PUBLIC by default,
--    which the linter flags because that also makes them callable directly
--    via `/rest/v1/rpc/...` by anon and authenticated alike. Nothing in the
--    app calls them that way. Moving them into a `private` schema -- which
--    is not in `db.schemas` (see supabase/config.toml) -- removes their
--    PostgREST route entirely, regardless of grants. Existing policy
--    expressions keep working: Postgres resolves them by function OID at
--    creation time, not by schema-qualified name, so `ALTER FUNCTION ... SET
--    SCHEMA` doesn't require touching any policy.
--
-- 2. The household INSERT policy's `WITH CHECK (true)` let any authenticated
--    user create unlimited household rows, including ones already seated in
--    a household. Bootstrapping a brand-new household only ever needs to
--    work for callers who aren't in one yet, so the check is tightened to
--    that.

create schema if not exists private;

grant usage on schema private to authenticated;

alter function public.current_household_id() set schema private;
alter function public.household_has_caregiver(uuid) set schema private;
alter function public.household_has_pending_invite(uuid, text) set schema private;

revoke execute on function private.current_household_id() from public;
revoke execute on function private.household_has_caregiver(uuid) from public;
revoke execute on function private.household_has_pending_invite(uuid, text) from public;

grant execute on function private.current_household_id() to authenticated;
grant execute on function private.household_has_caregiver(uuid) to authenticated;
grant execute on function private.household_has_pending_invite(uuid, text) to authenticated;

drop policy "authenticated users can create a household" on household;

create policy "authenticated users can create a household"
  on household for insert
  to authenticated
  with check (private.current_household_id() is null);
