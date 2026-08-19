-- Edit & delete entries (ticket 15): reverses ticket 06's "append-only by
-- omission" for a *single* log_entry row -- any caregiver in the household
-- can now edit or delete any entry, regardless of who created it. Ticket
-- 06's cross-entry history guarantee (logging the same Food/Child pair
-- again doesn't overwrite prior entries) is unaffected: editing or deleting
-- one row never touches any other log_entry row.
--
-- Table-level update/delete grants on log_entry and log_entry_reason_tag
-- already exist (granted alongside select/insert in ticket 06's migration)
-- -- only the RLS policies below were missing.

-- Scoped to household membership only (not `created_by`), matching the
-- "any household member" pattern already used by food/child inserts --
-- deliberately not restricted to the caregiver who created the entry.
-- The with check re-verifies food_id/child_id belong to the same household
-- as the insert policy does, so a caller can't reassign an entry to a
-- different household's food/child even though the data-access layer never
-- exposes foodId/childId as editable.
create policy "household members can update their household's log entries"
  on log_entry for update
  to authenticated
  using (household_id = public.current_household_id())
  with check (
    household_id = public.current_household_id()
    and exists (select 1 from food where food.id = food_id and food.household_id = household_id)
    and exists (select 1 from child where child.id = child_id and child.household_id = household_id)
  );

create policy "household members can delete their household's log entries"
  on log_entry for delete
  to authenticated
  using (household_id = public.current_household_id());

-- Lets a caregiver editing an entry's reason tags replace the full set
-- (delete the old rows, insert the new ones) -- the insert policy from
-- ticket 06 already covers the insert half of that round-trip.
create policy "household members can remove their log entries' reason tags"
  on log_entry_reason_tag for delete
  to authenticated
  using (household_id = public.current_household_id());
