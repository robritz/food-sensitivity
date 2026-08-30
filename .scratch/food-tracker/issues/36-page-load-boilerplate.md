# 36 — Extract shared page load/state boilerplate

**What to build:** Every data-backed page hand-rolls the same three things: a `Promise.all([...]) + cancelled`-flag load effect, `loading`/`loadError` state, and the `if (loading) …CircularProgress / if (loadError) …Alert` early-return wrapped in `<AppLayout>`. Consolidate this into one deep module so a page declares *what* it loads, not the async/guard/branch plumbing.

**Status:** ready-for-agent

- [ ] A `useLoadedData(loaders)` hook (or similar) that runs the fetches, cancels on unmount, and returns `{ data, loading, error }`.
- [ ] A `<PageState loading error title>` (or render-prop) wrapper that renders the spinner/error/`AppLayout` shell so pages stop repeating those branches.

**Grounding / where to change:**

- The duplicated shape lives in:
  - `src/pages/LogPage.tsx` -- the initial `Promise.all` of `listChildren/listFoods/listCategories/listReasonTags/listLogEntries` + `loading`/`loadError` branches.
  - `src/pages/BrowsePage.tsx` -- `baseLoading`/`loadError` + the base `Promise.all`.
  - `src/pages/MapPage.tsx` -- `loading`/`loadError` + its `Promise.all`.
  - `src/pages/ChildrenPage.tsx` -- same load/branch pattern.
- The `cancelled`-flag async idiom also recurs in the non-initial effects (summary fetch, history fetch, food search, geolocation, photo fetch). A companion `useCancellableEffect`/`useAsyncData` could absorb those too -- but scope this ticket to the *page-level* load first; fold the per-widget effects in only if it stays simple (per `codebase-design`: two adapters make a real seam -- confirm the shape genuinely matches before generalizing).
- Keep the deep-module discipline: small interface (pass the loaders, get back typed data + status), lots of plumbing hidden. Pages keep owning their own *interaction* state; this only covers initial load + shell.

**Tests / verification:**

- The repo has no jsdom/RTL, so hooks/components here aren't directly unit-testable -- guard with the full suite, typecheck, lint, and a manual smoke that each page still shows its spinner, error state, and loaded content. Extract any pure helper (e.g. combining loader results) so it can be unit-tested in isolation.

**Notes:**

- Biggest cognitive-load reduction left after ticket 31 -- collapses ~4 copies of the same boilerplate into one place.
- Behavior-preserving refactor; no schema or data-access changes.
- Noticed while auditing performance/cognitive-load after ticket 31 (see also 35).
