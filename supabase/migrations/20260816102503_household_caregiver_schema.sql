-- Baseline schema: household + caregiver, with household-scoped Row Level Security.
--
-- A caregiver row links a household to a Supabase Auth user (auth.users). All
-- future household-owned tables should follow the same pattern: a
-- `household_id` column plus RLS policies built on `public.current_household_id()`.

create table household (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table caregiver (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create index caregiver_household_id_idx on caregiver (household_id);

-- Returns the household of the currently authenticated caller, or null if
-- they aren't (yet) a caregiver in any household. security definer so it can
-- read the caregiver table even though RLS on that table is scoped by this
-- same function's result.
create function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from caregiver where user_id = auth.uid() limit 1;
$$;

alter table household enable row level security;
alter table caregiver enable row level security;

-- Table-level grants are separate from RLS: without these, Postgres denies
-- the operation outright before policies are ever evaluated. RLS is what
-- actually restricts *which* rows anon/authenticated can see or touch.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on household, caregiver to anon, authenticated, service_role;

create policy "household members can view their household"
  on household for select
  to authenticated
  using (id = public.current_household_id());

create policy "household members can update their household"
  on household for update
  to authenticated
  using (id = public.current_household_id())
  with check (id = public.current_household_id());

-- Any authenticated user may create a household, which bootstraps them as its
-- first (household-less) row -- they don't become a member until a caregiver
-- row links them to it via the insert policy below. Ticket 03 builds the
-- signup flow that chains these two inserts together.
create policy "authenticated users can create a household"
  on household for insert
  to authenticated
  with check (true);

create policy "household members can view fellow caregivers"
  on caregiver for select
  to authenticated
  using (household_id = public.current_household_id());

-- A caregiver row may only ever be inserted for the caller's own auth user
-- (self-linking). This intentionally allows joining any household whose id
-- is known, since there is no invite/membership check yet -- ticket 04
-- (invite caregiver) replaces this with an invite-token-gated path. Household
-- ids are random UUIDs and never exposed in listings, so this is acceptable
-- for the bootstrap skeleton.
create policy "callers can link themselves as a caregiver"
  on caregiver for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "caregivers can update their own row"
  on caregiver for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
