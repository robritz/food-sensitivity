# 06 — Core log entry: create a food and log a status

**What to build:** A caregiver can create a Food (category + specific brand/product) and log a LogEntry against it for a specific child, recording status (Liked/Disliked/Inconsistent), one or more sensory reason tags, and freeform notes. Entries are append-only history, visible in a basic chronological list.

**Blocked by:** 05 (Child profiles)

**Status:** done — implemented on `feature/05-child-profiles`, not yet merged

- [x] Predefined categories (Protein, Fruit, Vegetable, Snack, Dairy, Grain, Beverage) and reason tags (Texture, Smell, Taste, Appearance, Temperature, Sound/Crunch) are seeded
- [x] A caregiver can create a new Food with a category and brand/product name
- [x] A caregiver can create a LogEntry for a specific child referencing a Food, with status, one or more reason tags, and optional notes
- [x] Creating a new entry for a Food/child pair that already has entries does not overwrite prior entries — history is preserved
- [x] A basic chronological list of entries confirms persistence
- [x] Integration test: entries and Foods are scoped to household, invisible outside it

**Implementation notes:**
- New tables: `category`, `reason_tag` (each with a nullable `household_id` -- null rows are the predefined, system-seeded set; ticket 08 will add household-scoped custom rows to the same tables), `food`, `log_entry`, and the `log_entry_reason_tag` join table. All RLS-scoped via `current_household_id()`, following the `child` table's pattern.
- The `log_entry` insert policy additionally verifies `food_id`/`child_id` belong to the caller's household (not just `household_id` itself) -- otherwise a caller could reference another household's food/child by id.
- History is append-only by omission: no update/delete data-access functions or RLS policies exist for `log_entry`/`log_entry_reason_tag`.
- New data-access exports: `listCategories`, `listReasonTags`, `addFood`, `listFoods`, `addLogEntry`, `listLogEntries`.
- New page `/log` (behind `RequireAuth`), linked from the home screen -- lets a caregiver add a food, log an entry against it (food/child pick from a plain `<select>`; ticket 07 adds typeahead search), and see a reverse-chronological entry list.
