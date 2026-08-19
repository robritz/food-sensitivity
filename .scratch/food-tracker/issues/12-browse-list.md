# 12 — Food-grouped browse list

**What to build:** The main list screen shows one row per Food, displaying its most recent status and the child it applies to, with tap-through to that Food's full entry history.

**Blocked by:** 06 (Core log entry)

**Status:** done — implemented on `feature/12-browse-list`, not yet merged

- [x] List shows one row per Food per child (status is per Food/child pair)
- [x] Each row shows the most recent status for that Food/child
- [x] Tapping a row opens the full chronological history of entries for that Food/child
- [x] Integration test: list only shows the household's own Foods/entries

**Implementation notes:**

- `data-access/src/logEntries.ts`: added `listFoodStatusSummary(client)`, returning one `FoodStatusSummary` (`foodId`, `childId`, `latestEntryId`, `status`, `createdAt`) per `(food_id, child_id)` pair the household has ever logged. Implemented as a plain query ordered by `created_at desc` reduced client-side (first row seen per pair key wins) rather than a DB view/migration -- RLS already scopes the underlying rows, so no new SQL was needed.
- `listLogEntries` now takes an optional `{ foodId?, childId? }` filter (backward compatible -- `LogPage.tsx`'s existing no-arg call is untouched) so the browse page's tap-through history reuses it instead of a new query function.
- Both new/changed exports re-exported from `data-access/src/index.ts` (`listFoodStatusSummary`, `FoodStatusSummary`, `ListLogEntriesFilter`).
- New page `src/pages/BrowsePage.tsx`, routed at `/browse` in `src/App.tsx`, linked from `HomePage.tsx`'s nav list ("Browse foods"). Deliberately a new route rather than folding into `LogPage.tsx`, which sibling tickets 09/10/15 are concurrently editing.
- "Tapping a row opens history" is implemented as an in-page MUI `Dialog` (not a separate route/URL) that lazily fetches `listLogEntries({ foodId, childId })` only when a row is selected -- kept simple since the ticket only asks that history become visible, not that it be deep-linkable.
- New integration test file `data-access/test/logEntries.browse-list.test.ts`, following the `signUpFixture`/`admin` cleanup pattern from `helpers.ts` and the household-scoping test style used elsewhere. Covers: one summary row per Food/Child pair reflecting the latest status, separate rows per child for the same Food, household scoping on both `listFoodStatusSummary` and the filtered `listLogEntries`, and that the filtered history returns entries in reverse-chronological order.
- **Not yet run against a live Supabase instance** (per instructions, local Supabase wasn't started to avoid colliding with sibling agents 09/10/15 sharing the same Docker ports). Verify with `npm test` inside `data-access` against a running local stack before merging. `npm run build` (root, typecheck + Vite build) and `npm run lint` (oxlint) both pass; the non-Supabase root `npm run test` (vitest) suite also passes.
