# 19 — Nearby-only map pins (20 mile radius)

**What to build:** Scope the interactive map (ticket 18) and the location list beneath it to Locations within a 20-mile radius of the caregiver's current position, instead of showing every Location the household has ever logged food at.

**Blocked by:** ~~18 (Interactive map)~~ — implemented on `feature/18-interactive-map`, not yet merged

**Status:** done — implemented on `feature/19-map-radius-filter`, not yet merged

- [x] Map pins are limited to Locations within 20 miles of the caregiver's current GPS position
- [x] The location list under the map is scoped the same way (kept in sync with what's on the map)
- [x] No geolocation support, a denied permission prompt, or a failed position request all fall back to showing every logged Location unfiltered -- never blocks the page
- [x] Distinguishes "no entries logged at all" from "no entries within 20 miles" in the empty-state message

**Implementation notes:**

- New `src/lib/geoDistance.ts`: pure Haversine straight-line distance (`distanceMiles`, `isWithinMiles`), unit-tested in `src/__tests__/geoDistance.test.ts` against known city-pair distances. Straight-line, not driving distance -- a simple "how far away" radius, not a route.
- `src/pages/MapPage.tsx`: captures the caregiver's current position once per page visit via `navigator.geolocation.getCurrentPosition`, same graceful-degradation pattern ticket 10's `LogPage.tsx` capture uses (no support / denied / failed request just leaves the position unknown rather than surfacing an error). `allPins` (every Location with a logged entry, from `buildLocationPins`, unchanged) is filtered down to `pins` (within `NEARBY_RADIUS_MILES = 20` of the caregiver, once known) -- `pins` is what both `InteractiveMap` and the list below it render, so they can't drift out of sync.
- Per explicit decision when this ticket was scoped: filtering applies to both the map and the list (not map-only), and missing/denied geolocation falls back to the full unfiltered list rather than an empty map.
- **Not verified in a real browser** -- same tooling gap as ticket 18 (no browser-automation tool available this session, `.env.local` unreadable). Typecheck, lint, unit tests, and production build all pass; actual on-device geolocation behavior is unverified.
