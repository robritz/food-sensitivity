# 07 — Food catalog typeahead & reuse

**What to build:** When creating a log entry, a caregiver can search existing Foods by brand/product name as they type and reuse a matching Food instead of creating a duplicate.

**Blocked by:** 06 (Core log entry)

**Status:** done — implemented on `feature/07-food-typeahead`, not yet merged

- [x] Typing in the Food field while creating an entry searches existing household Foods by name/brand
- [x] Selecting a search result reuses the existing Food record for the new LogEntry
- [x] A new Food is only created when no existing match is selected
- [x] Integration test: search returns only the household's own Foods, not other households'

**Implementation notes:**
- New data-access export: `searchFoods(client, query)` in `data-access/src/foods.ts` -- an `ilike` substring match on `food.name`, ordered by name, capped at 10 results. Relies on the existing `food` select RLS policy (from ticket 06) to scope results to the caller's household, the same pattern `listFoods` uses.
- `LogPage`'s "Log an entry" form now uses an MUI `Autocomplete` (freeSolo) for the Food field: typing debounces into `searchFoods`; selecting a result reuses that Food's id; typing a name with no result selected shows a category picker and creates a new Food (via `addFood`) at submit time, then logs against it. This merges ticket 06's standalone "Add a food" form into the entry-creation flow, per this ticket's "a new Food is only created when no existing match is selected" framing -- catalog browsing itself (an "All foods" list, no add form) was kept so that capability isn't lost.
