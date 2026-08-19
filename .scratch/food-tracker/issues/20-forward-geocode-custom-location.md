# 20 — Forward-geocode custom location entry

**What to build:** When a caregiver edits the suggested place name into a custom address/name (ticket 10's Place field), forward-geocode the entered text via Mapbox so the saved Location gets a matching latitude/longitude instead of null coordinates.

**Blocked by:** 10 (Location capture, reverse geocoding & reuse)

**Status:** ready-for-agent

- [ ] Editing the Place field to custom text triggers a Mapbox forward-geocode lookup on the entered text (debounced -- not one request per keystroke)
- [ ] A successful lookup sets `locationCoords` to the matched latitude/longitude, so the saved Location record has real coordinates instead of null
- [ ] No match / lookup failure / no Mapbox token falls back to today's behavior (`locationCoords` stays null) -- never blocks entry submission
- [ ] Coordinates from a forward-geocode match are not treated as a Mapbox place-id match for dedup purposes -- still a custom Location (per ticket 10, dedup is keyed on `mapboxPlaceId`, which forward geocoding does not supply here)

**Implementation notes (not yet started):**

- Currently `src/pages/LogPage.tsx`'s Place `TextField` `onChange` (~line 929) clears both `locationMapboxPlaceId` and `locationCoords` to null the moment the caregiver edits the suggested name (see `cb4332d`), even if what they typed is a real, geocodable address -- that's the gap this ticket closes.
- `data-access/src/mapboxClient.ts` only has `fetchReverseGeocode` (coords -> name) today; this needs a new forward counterpart (text -> coords), likely `fetchForwardGeocode` or similar, hitting the same `mapbox.places` endpoint with the query text instead of coordinates. Mirror the existing isolation pattern: raw Mapbox call throws, a wrapping function (parallel to `reverseGeocode` in `data-access/src/locations.ts`) swallows failures and resolves to `null`.
- Needs debouncing on the `TextField` input (no existing debounce utility in the codebase yet, per a quick grep) to avoid firing a request per keystroke.
