# 18 — Interactive map

**What to build:** Replace the map view's static raster image with a real interactive map (pan, zoom, pins that stay correctly positioned as the view changes).

**Blocked by:** ~~14 (Map view)~~ — merged to main, unblocked

**Status:** done — implemented on `feature/18-interactive-map`, not yet merged

- [x] Map supports pan (drag) and zoom (scroll/pinch) instead of a fixed static image
- [x] Pins stay positioned at their correct Location coordinates as the map is panned/zoomed
- [x] Tapping a pin still opens the list of foods/entries logged at that location (ticket 14 behavior)
- [x] Degrades the same way ticket 14 does when `VITE_MAPBOX_TOKEN` is missing (list-only fallback, no broken map)

**Implementation notes:**

- Went with `mapbox-gl` directly (not a React wrapper like `react-map-gl`) -- it's driven imperatively off a plain container `<div>`, so there's no wrapper-library React-19-compatibility risk to check. New component: `src/components/InteractiveMap.tsx`, wired into `src/pages/MapPage.tsx`.
- `src/lib/staticMap.ts` (ticket 14's hand-rolled Web Mercator projection math) and its test are deleted -- mapbox-gl handles projection/fitting natively (`Marker.setLngLat`, `Map.fitBounds`), so there's no pure math left to unit-test here. No pure-logic seam existed for TDD on this ticket; the color-mapping logic that does have a seam (`buildLocationPins`) already had tests from ticket 14 and was untouched.
- `mapbox-gl` is a large dependency (~1.8MB built) -- lazy-loaded via `React.lazy`/`Suspense` in `MapPage.tsx` so it code-splits into its own chunk instead of bloating every page's bundle. This was necessary, not optional: an eager import pushed the main bundle to 3.05MB and hard-failed `npm run build` (PWA precache's default 2MB-per-file limit). Post-split, main bundle is 1.22MB and the map chunk (1.82MB) fits under the limit on its own.
- Self-review (`/code-review` against `main`) caught two real issues, both fixed in a follow-up commit: (1) the pin color palette was duplicated between `MapPage.tsx` and `InteractiveMap.tsx` with a `#`-prefix inconsistency -- consolidated into `src/lib/pinColors.ts`; (2) `mapboxgl.Marker` elements are plain `<div>`s, not natively focusable like the `IconButton`s they replaced -- added `tabindex` + Enter/Space handling so pins stay keyboard-operable.
- **Not verified in a real browser** -- this session had no browser-automation tool available, and `.env.local` (holding `VITE_MAPBOX_TOKEN`) wasn't readable to set up a manual check. Typecheck, lint, unit tests, and production build all pass, and the dev server serves the page without errors, but actual pan/zoom/marker-click behavior in a browser is unverified. Whoever picks this up next should do a manual pass (or re-run with browser tooling available) before merging.

**Notes for whoever picks this up:**
- Ticket 14 (`.scratch/food-tracker/issues/14-map-view.md`, branch `feature/14-map-view`, not yet merged as of this writing) built the map view as a Mapbox *Static Images API* raster with hand-computed pin overlay buttons drawn on top — there's no interactive pan/zoom, and pin positions are computed by hand in `src/lib/staticMap.ts` (`computeMapView`, `projectPoint`, `buildStaticMapUrl`) rather than by a real map renderer. That was a deliberate scoping choice at the time: no map library existed anywhere in the repo, only a raw `fetch` to Mapbox's reverse-geocoding REST endpoint (ticket 10).
- This ticket is that follow-up: swap the static image for a real interactive map, most likely via `mapbox-gl` (or a React wrapper like `react-map-gl`), which would be a new runtime dependency — flag if bundle size/licensing is a concern before picking a library.
- Reuse rather than reimplement: `data-access/src/mapPins.ts`'s `buildLocationPins(locations, entries)` already computes one pin per Location with a status-mix color (worst-status-present rule, documented there), and `listLocations` already fetches household-scoped Location rows. The screen is `src/pages/MapPage.tsx`. Only the rendering layer (`staticMap.ts` + the raster `<img>`/overlay-button markup in `MapPage.tsx`) should need replacing.
- Keep the existing "no token → plain list" graceful-degradation behavior ticket 14 established; don't make the map a hard dependency for the page to be useful.
