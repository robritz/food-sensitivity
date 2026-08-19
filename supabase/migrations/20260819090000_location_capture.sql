-- Location capture, reverse geocoding & reuse (ticket 10): a household-scoped
-- Location table plus an optional `location_id` FK on `log_entry`.
--
-- `mapbox_place_id` is set when the location was resolved from a Mapbox
-- reverse-geocoding match, and left null for a caregiver's manual/custom
-- entry (no Mapbox match, or the network call failed) -- only the
-- Mapbox-matched case is deduped, per the ticket's stated scope.

create table location (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  -- Null for a custom (no Mapbox match) Location -- see comment above.
  mapbox_place_id text,
  created_at timestamptz not null default now()
);

create index location_household_id_idx on location (household_id);

-- Dedup key for reuse: logging again at a previously used place (same
-- household, same Mapbox place id) should hit this index and find the
-- existing row rather than insert a new one. Partial (mapbox_place_id is not
-- null) so custom Locations, which have no place id, are never deduped
-- against each other.
create unique index location_household_mapbox_place_id_idx
  on location (household_id, mapbox_place_id)
  where mapbox_place_id is not null;

alter table location enable row level security;

grant select, insert, update, delete on location to anon, authenticated, service_role;

create policy "household members can view their household's locations"
  on location for select
  to authenticated
  using (household_id = public.current_household_id());

create policy "household members can add a location to their household"
  on location for insert
  to authenticated
  with check (household_id = public.current_household_id());

-- Nullable: not every historical entry has a captured location, and this
-- migration doesn't backfill existing log_entry rows.
alter table log_entry add column location_id uuid references location (id);

create index log_entry_location_id_idx on log_entry (location_id);

-- Replaces the ticket 06 insert policy so a location, when supplied, is also
-- checked to belong to the caller's own household -- same shape as the
-- existing food_id/child_id checks it's added alongside.
drop policy "household members can add a log entry to their household" on log_entry;

create policy "household members can add a log entry to their household"
  on log_entry for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and exists (select 1 from food where food.id = food_id and food.household_id = household_id)
    and exists (select 1 from child where child.id = child_id and child.household_id = household_id)
    and (
      location_id is null
      or exists (select 1 from location where location.id = location_id and location.household_id = household_id)
    )
  );
