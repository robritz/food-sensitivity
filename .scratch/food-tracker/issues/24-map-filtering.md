# 24 — Map & multi-person filtering

**What to build:** Two related filtering changes, split out of the `ux-improvements.md` backlog. The second builds on the first (the AND-semantics change is meant to be reused by the map-pin filter once that filter exists), so they're grouped here — pick up the map filter first, then the semantics change.

**Status:** ready-for-agent

- [ ] Let the map (`MapPage.tsx`) filter pins by family member. It already loads `children` (for the pin-detail dialog's `nameById`) and `buildLocationPins`/`filtering.ts` already support a `childIds` filter for `BrowsePage`, but `MapPage` doesn't expose that filter itself -- `allPins`/`pins` are built from every entry regardless of who logged it.
- [ ] Change the multi-person filter (map pins, and food rows on `BrowsePage`) from OR to overlap/AND semantics: selecting multiple people should return only results common to *all* of them, not results matching *any* of them. This is a bigger change than it sounds -- `ActiveFilters.childIds` in `filtering.ts` is currently OR-within-type (`filters.childIds.includes(entry.childId)`), which is correct as-is for a single `LogEntry` (it only ever has one `childId`). "Overlap between people" only makes sense aggregated at the Food level (a food only both people have logged, each via their own entries), so this needs new aggregation logic -- not just flipping `.some`/`.includes` to `.every` in `matchesFilters` -- likely built on `listFoodStatusSummary`/`row.foodId` grouping in `BrowsePage.tsx`, then reused for the map-pin filter above once that exists.

**Notes:**

- The two items are ordered: build the map-pin family-member filter first, then layer the OR→AND overlap semantics on top and reuse it for both surfaces.
- Independent of the "family member" model broadening still in `ux-improvements.md` — this ticket works against the existing `children`/`childIds` shapes; a later rename can sweep through both.
