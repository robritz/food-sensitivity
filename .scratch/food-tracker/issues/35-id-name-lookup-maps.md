# 35 — Replace repeated linear name lookups with id→name maps

**What to build:** `nameById` (in `src/lib/entryFormatting.ts`) does a linear `list.find(...)` every call. It's invoked per row, per name, per render across the browse list, the history/detail dialogs, the map's pin list, and the log page's lists -- so rendering an N-row list over an M-item source is O(N·M) each render. Build the id→name lookup once per source list and read from it instead.

**Status:** ready-for-agent

- [ ] Provide a cheap id→name (id→item) `Map` built once from a source list, and use it wherever `nameById`/`reasonTagNames` are called in a render loop.

**Grounding / where to change:**

- `src/lib/entryFormatting.ts` -- `nameById(list, id)` and `reasonTagNames(reasonTags, ids)` are the hot helpers. Candidate: a small `useNameLookup(list)` hook (or a plain `buildNameLookup(list): Map<string, string>`) that callers memoize, plus `nameFromLookup`/`reasonTagNamesFromLookup` variants. Keep the existing `nameById` for one-off (non-loop) calls so this stays a targeted change.
- Call sites in render loops today:
  - `src/pages/BrowsePage.tsx` -- `sortedRows` comparator (two `nameById` per comparison), the summary list rows, and the history dialog (`reasonTagNames`).
  - `src/pages/MapPage.tsx` -- the selected-pin entry list (`nameById(foods, ...)`, `nameById(children, ...)`).
  - `src/pages/log/EntryList.tsx`, `QueuedEntryList.tsx`, `EntryDetailDialog.tsx`, `FoodList.tsx` -- `nameById`/`reasonTagNames` per row.
- Memoize the lookups (`useMemo` keyed on the source list) so they're rebuilt only when the underlying `foods`/`children`/`reasonTags`/`categories`/`locations` change, not every render.

**Tests / verification:**

- `buildNameLookup`/`nameFromLookup` are pure -- unit-test them alongside the existing `entryFormatting.test.ts` (missing id still falls back to "Unknown", parity with `nameById`).
- Behavior-preserving: identical rendered text. Guard with the full suite, typecheck, and lint.

**Notes:**

- Minor at today's data sizes; the win is O(N·M) → O(N+M) as households accumulate foods/entries. Low risk, self-contained.
- Noticed while auditing performance/cognitive-load after ticket 31 (see also 36).
