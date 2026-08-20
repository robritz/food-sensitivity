# 20 — Forward-geocode custom location entry

**What to build:** When a caregiver edits the suggested place name into a custom address/name (ticket 10's Place field), forward-geocode the entered text via Mapbox so the saved Location gets a matching latitude/longitude instead of null coordinates.

**Blocked by:** 10 (Location capture, reverse geocoding & reuse)

**Status:** done -- implemented on `main`

- [x] Editing the Place field to custom text triggers a Mapbox forward-geocode lookup on the entered text (debounced -- not one request per keystroke)
- [x] A successful lookup sets `locationCoords` to the matched latitude/longitude, so the saved Location record has real coordinates instead of null
- [x] No match / lookup failure / no Mapbox token falls back to today's behavior (`locationCoords` stays null) -- never blocks entry submission
- [x] Coordinates from a forward-geocode match are not treated as a Mapbox place-id match for dedup purposes -- still a custom Location (per ticket 10, dedup is keyed on `mapboxPlaceId`, which forward geocoding does not supply here)

**Implementation notes:**

- `data-access/src/mapboxClient.ts`: new `fetchForwardGeocode(query, token)`, mirroring `fetchReverseGeocode` -- hits the same `mapbox.places` endpoint with the query text in the path instead of coordinates, throws on failure, resolves `null` on no match. Unit-tested (mocked `fetch`) in `data-access/test/mapboxClient.test.ts`.
- `data-access/src/locations.ts`: new `forwardGeocode(query, token)` wraps it in the same try/catch-to-null pattern as `reverseGeocode`, so a missing token, no network, or Mapbox being down never blocks submission. Not separately unit-tested, matching `reverseGeocode`'s own precedent (only the isolated `fetchX` call gets a dedicated test).
- `src/lib/debounce.ts`: new generic `debounce(fn, waitMs)` with a `.cancel()` method -- no existing debounce utility in the codebase, per the original scoping note. Unit-tested with `vi.useFakeTimers()` in `src/__tests__/debounce.test.ts`.
- `src/pages/LogPage.tsx`'s Place `TextField` `onChange`: still clears `locationMapboxPlaceId` and `locationCoords` immediately on every edit (unchanged from `cb4332d`), then kicks off a debounced (500ms) forward-geocode call on the trimmed text. `forwardGeocodeRequestIdRef` is bumped on every keystroke (not just when the debounce fires) so a slower in-flight lookup from an earlier edit can't clobber `locationCoords` set by a newer one. `locationMapboxPlaceId` is never set from a forward-geocode match, so `findOrCreateLocation` always treats it as a new custom Location, never a dedupe-by-place-id reuse.
- **Not verified in a real browser** -- same tooling/env gap noted on tickets 18 and 19 (no browser-automation tool this session, `.env.local`/`VITE_MAPBOX_TOKEN` unavailable). Typecheck, lint, unit tests (`debounce`, `mapboxClient`), and production build all pass; actual on-device forward-geocode behavior against live Mapbox is unverified. Four pre-existing `data-access` integration tests fail locally with "JWT issued at future" (a local Supabase clock-skew issue, unrelated to this change -- none of the four touch forward-geocoding).
