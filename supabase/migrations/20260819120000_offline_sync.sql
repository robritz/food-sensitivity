-- Offline entry creation & sync (ticket 11): a log entry (and its photos)
-- created while offline is queued locally and synced once connectivity
-- returns. The sync must be idempotent -- retrying after a dropped
-- connection whose response never made it back to the caller must not
-- create a duplicate `log_entry` row or a duplicate photo.
--
-- `log_entry`/`log_entry_reason_tag` already grant enough for that: the
-- data-access layer (see `addLogEntry`) achieves idempotency purely by
-- supplying its own `id` on insert and falling back to a select on a
-- 23505 conflict, plus an `upsert(..., { ignoreDuplicates: true })` for
-- reason tags -- neither needs a new policy, since a unique-violation
-- "do nothing" insert never touches an existing row (no UPDATE required).
--
-- Retried *photo* uploads are different: `addLogEntryPhoto` reuses the same
-- storage path across sync attempts and passes `upsert: true` so a retry
-- overwrites rather than erroring, but Storage's upsert path issues an
-- UPDATE against the existing object when one is already there -- which
-- ticket 09's insert-only storage policy doesn't permit. Add the missing
-- UPDATE policy, scoped identically to that insert policy.
create policy "household members can overwrite their own entries' photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'entry-photos'
    and (storage.foldername(name))[1] = public.current_household_id()::text
  )
  with check (
    bucket_id = 'entry-photos'
    and (storage.foldername(name))[1] = public.current_household_id()::text
    and exists (
      select 1 from log_entry
      where log_entry.id::text = (storage.foldername(name))[2]
        and log_entry.household_id = public.current_household_id()
    )
  );
