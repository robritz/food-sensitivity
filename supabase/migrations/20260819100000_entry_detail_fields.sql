-- Entry detail fields (ticket 09): optional intensity rating, an editable
-- "date happened" for backdating, and up to 4 attached photos per LogEntry.
--
-- `log_entry` stays insert-only (no update/delete policy is added here,
-- matching ticket 06's append-only design -- ticket 15 owns editing).

alter table log_entry
  add column intensity smallint check (intensity between 1 and 5),
  add column occurred_at timestamptz not null default now();

comment on column log_entry.intensity is
  'Optional 1-5 caregiver-set intensity rating for the reaction.';
comment on column log_entry.occurred_at is
  '"Date happened" -- defaults to submission time but is editable to a past
   date, unlike created_at which always reflects when the row was inserted.';

create index log_entry_occurred_at_idx on log_entry (occurred_at);

-- Photos: stored in Supabase Storage rather than a metadata table -- there is
-- no per-photo data beyond the file itself, so the storage object *is* the
-- record. Objects live at `${household_id}/${log_entry_id}/${filename}`;
-- storage RLS below reads the household id straight out of that path, the
-- same way row-level policies elsewhere compare a `household_id` column to
-- `current_household_id()`, just expressed as a path segment since storage
-- objects have no columns to filter on.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'entry-photos',
  'entry-photos',
  false,
  5242880, -- 5MiB per photo
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic']
);

create policy "household members can view their household's entry photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'entry-photos'
    and (storage.foldername(name))[1] = public.current_household_id()::text
  );

-- Beyond the household-id path segment, this also requires the second path
-- segment to name a log_entry that actually belongs to the caller's
-- household -- otherwise a caller could upload under their own household
-- prefix but an arbitrary/nonexistent log_entry_id. Mirrors the
-- food_id/child_id checks on the log_entry insert policy itself.
create policy "household members can upload photos to their own entries"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'entry-photos'
    and (storage.foldername(name))[1] = public.current_household_id()::text
    and exists (
      select 1 from log_entry
      where log_entry.id::text = (storage.foldername(name))[2]
        and log_entry.household_id = public.current_household_id()
    )
  );
