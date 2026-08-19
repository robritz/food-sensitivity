# UX improvements

**What to build:** N/A — a running list of smaller usability/interaction improvements noticed while implementing other tickets. Items here aren't scoped or estimated; triage into their own ticket before picking one up.

**Status:** needs-triage

- [ ] Set focus to the "Name" field after adding a child on `ChildrenPage` (`src/pages/ChildrenPage.tsx`), so adding several children in a row doesn't require re-clicking into the field each time.
- [ ] Convert the food picker on `LogPage` (`src/pages/LogPage.tsx`) from a typeahead `Autocomplete` to a plain dropdown when offline. Ticket 11's offline logging only allows an existing Food, and the offline picker (see `filterFoodsOffline` in `src/lib/offlineFoodSearch.ts`) already filters the full in-memory list rather than searching a live index -- a dropdown of that same already-loaded list would be a more honest affordance than a typeahead text field, which implies a live search that isn't happening.
