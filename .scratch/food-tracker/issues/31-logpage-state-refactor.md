# 31 — Refactor LogPage state handling

**What to build:** `LogPage` (`src/pages/LogPage.tsx`) has grown to a large number of `useState` hooks spanning several distinct responsibilities. It's now the biggest, most-touched component in the app (tickets 06/07/08/09/10/11/17/20/21/22/25/28 have all piled onto it). Reorganize its state so each responsibility is cohesive and independently reasoned about, without changing behavior.

**Status:** done

- [x] Reduce/organize `LogPage`'s state, which spans (at least) three responsibilities: the add-food/category picker, the add-entry form (status, reasons, notes, intensity, occurredAt, photos, location), and the entries/queue list + detail/edit/delete dialogs.

**Resolution:** Decomposed `LogPage.tsx` (1503 -> 287 lines) into a thin coordinator that holds only the shared household data + which entry each dialog is open for, plus a `src/pages/log/` module of cohesive pieces:

- `useLocationCapture.ts` -- deep hook hiding the whole opt-in location group (GPS, reverse-geocode, Mapbox Search Box suggest/retrieve + session-token lifecycle); small interface (`enabled`/`status`/`picker`/`suggestions`/`loading` for view, `resolveLocationId`/`buildLocationCapture` for the two submit paths). `LocationField.tsx` is its view.
- `AddEntryForm.tsx` -- owns all add-entry draft state + both submit paths; reports mutations (new entry/queued/food/category/reason tag) up via callbacks.
- `EditEntryDialog` / `DeleteEntryDialog` / `EntryDetailDialog` -- each owns its own interaction state and performs its own data-access call, coordinator just supplies the target entry and hears back the result.
- `EntryList` / `QueuedEntryList` / `FoodList` -- presentational lists.
- `logHelpers.ts` + `useFreeSoloPicker.ts` -- shared pure helpers/hook. Extracted pure logic (`toDatetimeLocalValue`, `statusLabel`, `findByNameCaseInsensitive`, `nameById`, `reasonTagNames`, `resolveLocationName`) is now unit-tested in `log/__tests__/logHelpers.test.ts`.

Behavior-preserving: no schema/data-access changes. Verified with `npm run build` (typecheck), `npm run test` (51 pass, +12 new), and `npm run lint` (clean). Manual smoke of log/edit/delete/offline/photo/location flows still recommended before merge (repo has no jsdom/RTL, so those paths aren't unit-covered).

**Grounding / where to change:**

- Everything is in one ~1400-line `LogPage.tsx` today. Candidate approaches (pick per the deep-module/`codebase-design` guidance, don't over-engineer):
  - Extract cohesive subcomponents (e.g. `AddEntryForm`, `EntryList`, `EntryDetailDialog`, the location picker) with their own local state, leaving `LogPage` as a thin coordinator.
  - And/or consolidate related fields onto `useReducer` where a cluster of `useState` always changes together (e.g. the location capture group added in ticket 28: `locationEnabled`/`locationStatus`/`locationCoords`/picker/session refs).
  - The `useFreeSoloPicker` hook is already a good seam to keep/lean on.
- **Behavior-preserving refactor:** no user-visible change. The offline queue, photo upload, location opt-in (ticket 28), and Mapbox session-token lifecycle must all still work exactly as now.

**Tests / verification:**

- This repo has no jsdom/RTL, so `LogPage` itself isn't unit-tested. Guard the refactor with the existing full suites (frontend + data-access), typecheck, lint, and a manual smoke of the log/edit/delete/offline/photo/location flows. If any pure logic gets extracted (e.g. a reducer), unit-test that in isolation -- that's the win of pulling it out.

**Notes:**

- Related to ticket 32 (investigate slow UI on the food log page) -- a re-render/state audit for this refactor and the perf investigation likely overlap; consider doing 32 first (or alongside) so the refactor is informed by where the actual cost is.
- Pure cleanup; no schema or data-access changes expected.
