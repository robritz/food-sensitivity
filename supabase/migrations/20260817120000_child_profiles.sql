-- Child profiles (ticket 05): a household's children, each with a name and
-- birthdate. Follows the same household-scoped RLS pattern as `household`
-- and `caregiver` -- a `household_id` column plus policies built on
-- `public.current_household_id()`.

create table child (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  name text not null,
  birthdate date not null,
  created_at timestamptz not null default now()
);

create index child_household_id_idx on child (household_id);

alter table child enable row level security;

grant select, insert, update, delete on child to anon, authenticated, service_role;

create policy "household members can view their household's children"
  on child for select
  to authenticated
  using (household_id = public.current_household_id());

create policy "household members can add a child to their household"
  on child for insert
  to authenticated
  with check (household_id = public.current_household_id());
