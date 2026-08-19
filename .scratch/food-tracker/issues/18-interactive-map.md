# 18 — Interactive map

**What to build:** Replace the map view's static raster image with a real interactive map (pan, zoom, pins that stay correctly positioned as the view changes).

**Blocked by:** ~~14 (Map view)~~ — merged to main, unblocked

**Status:** ready-for-agent

- [ ] Map supports pan (drag) and zoom (scroll/pinch) instead of a fixed static image
- [ ] Pins stay positioned at their correct Location coordinates as the map is panned/zoomed
- [ ] Tapping a pin still opens the list of foods/entries logged at that location (ticket 14 behavior)
- [ ] Degrades the same way ticket 14 does when `VITE_MAPBOX_TOKEN` is missing (list-only fallback, no broken map)

**Notes for whoever picks this up:**
- Ticket 14 (`.scratch/food-tracker/issues/14-map-view.md`, branch `feature/14-map-view`, not yet merged as of this writing) built the map view as a Mapbox *Static Images API* raster with hand-computed pin overlay buttons drawn on top — there's no interactive pan/zoom, and pin positions are computed by hand in `src/lib/staticMap.ts` (`computeMapView`, `projectPoint`, `buildStaticMapUrl`) rather than by a real map renderer. That was a deliberate scoping choice at the time: no map library existed anywhere in the repo, only a raw `fetch` to Mapbox's reverse-geocoding REST endpoint (ticket 10).
- This ticket is that follow-up: swap the static image for a real interactive map, most likely via `mapbox-gl` (or a React wrapper like `react-map-gl`), which would be a new runtime dependency — flag if bundle size/licensing is a concern before picking a library.
- Reuse rather than reimplement: `data-access/src/mapPins.ts`'s `buildLocationPins(locations, entries)` already computes one pin per Location with a status-mix color (worst-status-present rule, documented there), and `listLocations` already fetches household-scoped Location rows. The screen is `src/pages/MapPage.tsx`. Only the rendering layer (`staticMap.ts` + the raster `<img>`/overlay-button markup in `MapPage.tsx`) should need replacing.
- Keep the existing "no token → plain list" graceful-degradation behavior ticket 14 established; don't make the map a hard dependency for the page to be useful.
