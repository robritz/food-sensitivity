# 14 — Map view

**What to build:** A map shows one pin per Location the household has logged food at, color-coded by the mix of statuses logged there, with tap-to-open showing the list of foods logged at that location.

**Blocked by:** 10 (Location capture, reverse geocoding & reuse)

**Status:** done — implemented on `feature/14-map-view`, not yet merged

- [x] Map renders one pin per Location with at least one entry
- [x] Pin color reflects the statuses of entries logged at that location
- [x] Tapping a pin opens a list of foods/entries logged there
- [x] Integration test: map data is scoped to household

**Implementation notes:**
- No interactive map library (e.g. mapbox-gl) existed anywhere in the repo --
  ticket 10 only ever used Mapbox's reverse-geocoding REST endpoint via plain
  `fetch`. To reuse "the same map library/token setup" in spirit (same
  `VITE_MAPBOX_TOKEN`, same direct-HTTP-call style, no new heavyweight
  dependency), the map renders a Mapbox Static Images API raster image with
  hand-computed Web Mercator projection math (`src/lib/staticMap.ts`)
  overlaying clickable buttons in the same positions. See that file's header
  comment for the reasoning.
- Pin color rule (documented in `data-access/src/mapPins.ts`): a Location's
  pin shows the most cautionary status present across its entries --
  disliked > inconsistent > liked -- rather than the majority status, so a
  single bad reaction at an otherwise-fine Location isn't hidden.
- Without `VITE_MAPBOX_TOKEN` set, the page falls back to a plain tappable
  list (still color-coded, still opens the same entry-list dialog) rather
  than blocking -- the same "degrade gracefully on missing token" rule
  ticket 10's location capture already follows.
