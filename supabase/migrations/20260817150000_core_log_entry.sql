-- Core log entry (ticket 06): the Food catalog, the predefined
-- Category/ReasonTag taxonomy, and the append-only LogEntry history.
--
-- `category` and `reason_tag` rows with a null `household_id` are the
-- predefined, system-seeded set visible to every household; household-scoped
-- custom additions (ticket 08) will use the same tables with `household_id`
-- set, so no migration is needed when that ticket adds their insert policies.

create table category (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references household (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table reason_tag (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references household (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table food (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  category_id uuid not null references category (id),
  name text not null,
  created_at timestamptz not null default now()
);

create index food_household_id_idx on food (household_id);

-- The append-only history: a LogEntry is never updated or deleted (no update
-- policy is added), so repeated entries for the same Food/Child pair simply
-- accumulate rather than overwrite each other.
create table log_entry (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  food_id uuid not null references food (id),
  child_id uuid not null references child (id),
  status text not null check (status in ('liked', 'disliked', 'inconsistent')),
  notes text,
  created_by uuid not null references caregiver (id),
  created_at timestamptz not null default now()
);

create index log_entry_household_id_idx on log_entry (household_id);
create index log_entry_food_id_idx on log_entry (food_id);
create index log_entry_child_id_idx on log_entry (child_id);

create table log_entry_reason_tag (
  household_id uuid not null references household (id) on delete cascade,
  log_entry_id uuid not null references log_entry (id) on delete cascade,
  reason_tag_id uuid not null references reason_tag (id),
  primary key (log_entry_id, reason_tag_id)
);

create index log_entry_reason_tag_household_id_idx on log_entry_reason_tag (household_id);

alter table category enable row level security;
alter table reason_tag enable row level security;
alter table food enable row level security;
alter table log_entry enable row level security;
alter table log_entry_reason_tag enable row level security;

grant select, insert, update, delete on category, reason_tag, food, log_entry, log_entry_reason_tag
  to anon, authenticated, service_role;

create policy "categories are visible to every household (predefined + own custom)"
  on category for select
  to authenticated
  using (household_id is null or household_id = public.current_household_id());

create policy "reason tags are visible to every household (predefined + own custom)"
  on reason_tag for select
  to authenticated
  using (household_id is null or household_id = public.current_household_id());

create policy "household members can view their household's foods"
  on food for select
  to authenticated
  using (household_id = public.current_household_id());

create policy "household members can add a food to their household"
  on food for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and exists (
      select 1 from category
      where category.id = category_id
        and (category.household_id is null or category.household_id = household_id)
    )
  );

create policy "household members can view their household's log entries"
  on log_entry for select
  to authenticated
  using (household_id = public.current_household_id());

-- Beyond the household_id column itself, this also requires the referenced
-- food and child to actually belong to that household -- otherwise a caller
-- could set household_id to their own while pointing food_id/child_id at
-- another household's row (whose id they'd need to already know, but RLS
-- shouldn't rely on that being hard).
create policy "household members can add a log entry to their household"
  on log_entry for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and exists (select 1 from food where food.id = food_id and food.household_id = household_id)
    and exists (select 1 from child where child.id = child_id and child.household_id = household_id)
  );

create policy "household members can view their log entries' reason tags"
  on log_entry_reason_tag for select
  to authenticated
  using (household_id = public.current_household_id());

create policy "household members can tag their own household's log entries"
  on log_entry_reason_tag for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and exists (select 1 from log_entry where log_entry.id = log_entry_id and log_entry.household_id = household_id)
    and exists (
      select 1 from reason_tag
      where reason_tag.id = reason_tag_id
        and (reason_tag.household_id is null or reason_tag.household_id = household_id)
    )
  );

-- Predefined seed data, per the spec's confirmed default lists. Seeded here
-- (rather than in supabase/seed.sql, which only runs on local `db reset`) so
-- these rows exist in production too, not just local/test databases.
insert into category (name) values
  ('Protein'), ('Fruit'), ('Vegetable'), ('Snack'), ('Dairy'), ('Grain'), ('Beverage');

insert into reason_tag (name) values
  ('Texture'), ('Smell'), ('Taste'), ('Appearance'), ('Temperature'), ('Sound/Crunch');
