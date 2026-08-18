-- Custom categories & reason tags (ticket 08): lets a household add its own
-- category/reason_tag rows alongside the predefined, system-seeded set.
--
-- The `category`/`reason_tag` tables and their select policies (predefined +
-- own household) already exist from ticket 06 -- this only adds the insert
-- policies, scoped so a caregiver can add a row to their own household but
-- never a predefined row (household_id null) or another household's row.

create policy "household members can add a custom category to their household"
  on category for insert
  to authenticated
  with check (household_id = public.current_household_id());

create policy "household members can add a custom reason tag to their household"
  on reason_tag for insert
  to authenticated
  with check (household_id = public.current_household_id());
