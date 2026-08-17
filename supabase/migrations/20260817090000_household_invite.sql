-- Household invites: the second (and, for v1, only other) way to become a
-- caregiver -- joining a household that already has members, because someone
-- in it invited this exact email address. Ticket 03's "founds a new
-- household" insert policy only covers empty households.

create table household_invite (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  email text not null,
  invited_by uuid not null references caregiver (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index household_invite_household_id_idx on household_invite (household_id);

alter table household_invite enable row level security;

grant select, insert, update, delete on household_invite to anon, authenticated, service_role;

create policy "household members can invite a caregiver by email"
  on household_invite for insert
  to authenticated
  with check (household_id = public.current_household_id());

create policy "household members can view invites for their household"
  on household_invite for select
  to authenticated
  using (household_id = public.current_household_id());

-- Lets an invitee discover which household invited them before they have a
-- caregiver row of their own -- current_household_id() (which reads the
-- caregiver table) isn't available to them yet. Scoped by their own verified
-- auth email (auth.email(), from the Auth server's own record), not
-- client-editable metadata, so this can't be spoofed by inviting yourself.
create policy "invitees can view invites addressed to their own email"
  on household_invite for select
  to authenticated
  using (lower(email) = lower(auth.email()));

-- security definer (like household_has_caregiver) so the caregiver insert
-- policy below can check for a matching invite without depending on the
-- select policies above.
create function public.household_has_pending_invite(target_household_id uuid, invitee_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from household_invite
    where household_id = target_household_id
      and lower(email) = lower(invitee_email)
  );
$$;

create policy "invited users can join their invited household as caregiver"
  on caregiver for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.household_has_pending_invite(household_id, auth.email())
  );
