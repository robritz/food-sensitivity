# 28 — Make location tracking optional

**What to build:** Location should be an opt-in detail, not something captured for every entry. Most entries are basic foods where a place is noise; location is only really useful for restaurants (where a food was tried out) and for tracking where a basic food was purchased. Stop auto-capturing/prompting for location on every log, let a caregiver add one only when it matters, and keep the map showing pins only for entries that actually have a location.

**Status:** ready-for-agent

- [ ] On `LogPage` (`src/pages/LogPage.tsx`), don't auto-request GPS / reverse-geocode on page load. Today `locationStatus` starts at `'locating'` and a mount effect fires `navigator.geolocation.getCurrentPosition`, then reverse-geocodes and prefills the Place field -- so every visit prompts for location permission and pushes a place onto every entry. Make location capture opt-in behind an explicit affordance (e.g. an "Add a location" / "Where?" toggle or button) that only then requests GPS and shows the Place picker. An entry logged without touching it saves with no location.
- [ ] Entries logged without a location save with `locationId = null`. This is already supported end-to-end (`LogEntry.locationId` is nullable, `addLogEntry` writes `location_id: null`, `resolveLocationId`/`buildLocationCapture` already return `undefined` when there's no coords/name) -- so this is mainly making sure the new opt-in flow keeps that path working, not new data-access work. **No migration needed.**
- [ ] On the map page (`MapPage.tsx` / `buildLocationPins`), only create pins for entries that have a location. `buildLocationPins` already skips entries with `locationId == null`, so verify this still holds after the change and that the map's empty state reads sensibly once most entries have no location (e.g. "No entries logged with a location yet." already exists) -- add/adjust a test if the guard isn't covered.

**Notes / grounding:**

- Already true today (don't redo): `location_id` is nullable in the schema and `data-access` (`data-access/src/logEntries.ts`), and `buildLocationPins` (`data-access/src/mapPins.ts`) already drops null-location entries. The substantive change is the `LogPage` capture UX.
- The GPS-on-load path also feeds ticket 21/22's proximity bias (`caregiverPositionRef`) for the Place search. Under opt-in, request the caregiver's position only once they open the location affordance, then use it both to seed the suggestion and to bias search -- don't request it up front just for the bias.
- Keep the graceful-degrade behavior already in place: no geolocation support, denied permission, or missing Mapbox token should still let the caregiver type/pick a place (or skip it), never block submitting the entry.
- Offline path (`buildLocationCapture`, ticket 11) should stay consistent -- no location captured unless the caregiver opted in.

**Open design choice (non-blocking):**

- Exact affordance: a collapsible "Add a location" button that reveals the existing Place autocomplete is the lightest touch and reuses the current picker. Confirm placement/wording with the requester if unsure, but don't block on it.
