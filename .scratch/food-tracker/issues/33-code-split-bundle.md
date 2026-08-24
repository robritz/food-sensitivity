# 33 — Code-split the app bundle / clear the chunk-size warning

**What to build:** `npm run build` warns that some chunks are larger than 500 kB. Reduce the main bundle so pages/heavy deps load on demand, and settle the warning (either by fixing the underlying size or deliberately adjusting the threshold). Consolidates the three "Performance" items from the tech-debt list.

**Status:** ready-for-agent

- [ ] Use dynamic `import()` to code-split the application (route/page-level `React.lazy` + `Suspense`).
- [ ] Configure chunking via Vite/Rollup (`build.rollupOptions.output` `manualChunks`, or Rolldown's `output.codeSplitting`) to split large vendor deps out of the entry chunk.
- [ ] Adjust `build.chunkSizeWarningLimit` if a remaining large chunk is understood and acceptable, rather than leaving a noisy warning.

**Grounding / where to change:**

- `vite.config.ts` currently has **no `build` section** -- the plugins (`@vitejs/plugin-react`, `vite-plugin-pwa`) are configured but chunking is default.
- `MapPage` already lazy-loads `mapbox-gl` via `lazy(() => import('../components/InteractiveMap'))`, so the remaining weight is elsewhere -- likely the eagerly-imported pages in `src/App.tsx` (every page + MUI + jsPDF are pulled into the entry chunk) and vendor libs.
  - `src/App.tsx` imports all pages statically -- convert the routed pages to `React.lazy` + a `Suspense` fallback so each route is its own chunk.
  - `jspdf` (used only by the export flow in `src/lib/exportDownload.ts`/`BrowsePage`) is a good candidate to keep out of the entry chunk via dynamic import at the export call site and/or `manualChunks`.
- Note the PWA precache: `vite-plugin-pwa` precaches built assets (~3.4 MB across 15 entries today). More, smaller chunks change what's precached; make sure the service worker still builds and the precache stays sane (the default 2 MB-per-file limit is why `mapbox-gl` was split out in the first place -- keep new chunks under it).

**Verification:**

- `npm run build` completes without the >500 kB warning (or with a consciously-raised limit), the PWA service worker still generates, and `npm run preview` loads each route (lazy chunks fetch on navigation). Run typecheck/lint/tests as usual.

**Notes:**

- Independent of tickets 31/32, though it touches the same page-heavy area from the bundle side rather than the runtime side.
