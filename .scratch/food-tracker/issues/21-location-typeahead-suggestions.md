# 21 — Location typeahead: nearby address suggestions while typing

**What to build:** As the caregiver types into the Place field (ticket 10), search Mapbox for matching places biased toward the caregiver's current position and offer them as a picklist, instead of only silently forward-geocoding the typed text in the background (ticket 20).

**Blocked by:** 20 (Forward-geocode custom location entry)

**Status:** ready-for-agent

- [ ] Typing in the Place field (once it's no longer reflecting a previously-suggested/selected place) searches Mapbox for matching places, debounced -- not one request per keystroke
- [ ] Results are biased toward the caregiver's current GPS position (captured once per page visit, same position ticket 10 already captures) via Mapbox's `proximity` param, so nearby matches rank first
- [ ] Matches are shown as a picklist under the field; selecting one sets the Place field to that match's name, and the saved Location uses that match's coordinates and Mapbox place id (eligible for the ticket 10 reuse-by-place-id dedup, like the initial GPS-based suggestion)
- [ ] The caregiver can still type and submit arbitrary custom text without picking a suggestion -- ticket 20's fallback (silently forward-geocoding the typed text for coordinates, without a place id) is preserved for that case
- [ ] No geolocation support/permission, no Mapbox token, no network, or a failed/empty search all degrade to a plain free-text field (no picklist, no proximity bias) -- never blocks entry submission, same as tickets 10/20

**Implementation notes (not yet started):**

- `data-access/src/mapboxClient.ts`'s `fetchForwardGeocode` (ticket 20) currently returns at most one `{ latitude, longitude }` match with no name or place id. Needs to become list-returning (Mapbox's `limit` param, capped at 10) and reuse `nameFromMapboxFeature` for each feature so callers get `{ mapboxPlaceId, name, latitude, longitude }` per match -- the same shape `fetchReverseGeocode` already produces, just plural. Also needs an optional `proximity` param (`longitude,latitude` -- opposite order from the URL path's `latitude,longitude` reverse-geocode uses, easy to get backwards).
- `src/pages/LogPage.tsx`'s Place field is currently a plain `TextField`; this ticket turns it into a `freeSolo` MUI `Autocomplete`, following the exact pattern `foodPicker`/`categoryPicker` already use (`useFreeSoloPicker<T extends NamedOption>()` + `filterOptions={(options) => options}` since Mapbox already did the filtering + `loading` prop, no custom spinner adornment).
- The debounce should follow the codebase's existing idiom for this exact kind of search-as-you-type -- a `useEffect` keyed on the picker's `inputValue`/`value` with an internal `setTimeout` + cleanup, exactly like the food-search effect a few dozen lines above the Place field in the same file. (Ticket 20 introduced a standalone `debounce()` utility in `src/lib/debounce.ts` for this same field before this convention was noticed in-repo -- worth reconsidering whether that utility should stay, given this ticket touches the same code and the effect-based idiom is already established here.)
- The caregiver's raw GPS position (for `proximity`) needs to stay available even after the Place field's own `locationCoords` gets overwritten by a selection or a forward-geocode fallback match -- it isn't the same value once the caregiver picks a different place than where they're standing.
