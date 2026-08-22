# 24 — Map & multi-person filtering

**What to build:** Two related filtering changes, split out of the `ux-improvements.md` backlog. The second builds on the first (the AND-semantics change is meant to be reused by the map-pin filter once that filter exists), so they're grouped here — pick up the map filter first, then the semantics change.

**Status:** done -- implemented on `chore/24-map-filtering`

- [x] Let the map (`MapPage.tsx`) filter pins by family member. It already loads `children` (for the pin-detail dialog's `nameById`) and `buildLocationPins`/`filtering.ts` already support a `childIds` filter for `BrowsePage`, but `MapPage` doesn't expose that filter itself -- `allPins`/`pins` are built from every entry regardless of who logged it.
- [x] Change the multi-person filter (map pins, and food rows on `BrowsePage`) from OR to overlap/AND semantics: selecting multiple people should return only results common to *all* of them, not results matching *any* of them. This is a bigger change than it sounds -- `ActiveFilters.childIds` in `filtering.ts` is currently OR-within-type (`filters.childIds.includes(entry.childId)`), which is correct as-is for a single `LogEntry` (it only ever has one `childId`). "Overlap between people" only makes sense aggregated at the Food level (a food only both people have logged, each via their own entries), so this needs new aggregation logic -- not just flipping `.some`/`.includes` to `.every` in `matchesFilters` -- likely built on `listFoodStatusSummary`/`row.foodId` grouping in `BrowsePage.tsx`, then reused for the map-pin filter above once that exists.

**Implementation notes:**

- Core seam in `data-access/src/filtering.ts`: `keysCommonToChildren` (intersection of each selected child's key set) + generic `filterByChildOverlap<T extends {childId}>(items, childIds, keyOf)` (keep a selected child's items only for keys every selected child shares). Both pure and unit-tested. `keyOf` chooses the overlap dimension so each surface picks its own.
- **The overlap dimension differs by surface:** the browse list overlaps on **food** (`entry.foodId`) -- foods every selected child has logged; the map overlaps on **location** (`entry.locationId`) -- locations every selected child has logged an entry at (the map is about places, not foods).
- `childIds` pulled out of per-entry `matchesFilters`; `filterLogEntries` applies `filterByChildOverlap` (food key) *after* the per-entry filters, so overlap respects other active filters (e.g. foods every child has *liked*). BrowsePage rows and CSV/PDF export inherit this via `listFoodStatusSummary`/`listFilteredLogEntries` -- no BrowsePage logic change needed.
- `MapPage.tsx`: new "Family member" filter; `filterByChildOverlap(entries, childFilter, (e) => e.locationId)` runs before `buildLocationPins`. Empty selection = every logged location (no regression); filter-empty state has its own message.
- Extracted the shared `MultiSelectFilter` out of `BrowsePage` into `src/components/MultiSelectFilter.tsx` so the map reuses it rather than duplicating the Autocomplete.
- Single-child selection is unchanged (an OR filter of one == that child's entries).
- Verification: 23 filtering unit tests + a new end-to-end multi-child overlap integration test; full data-access suite (146) and frontend suite (37) pass, plus typecheck/lint/build.

**Original notes:**

- The two items are ordered: build the map-pin family-member filter first, then layer the OR→AND overlap semantics on top and reuse it for both surfaces.
- Independent of the "family member" model broadening still in `ux-improvements.md` — this ticket works against the existing `children`/`childIds` shapes; a later rename can sweep through both.
