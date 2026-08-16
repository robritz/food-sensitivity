# 10 — Location capture, reverse geocoding & reuse

**What to build:** When creating an entry, the caregiver's GPS location is captured and reverse-geocoded (via Mapbox) into a suggested place name, which they can confirm or edit; Locations are deduped and reused across entries at the same place.

**Blocked by:** 06 (Core log entry)

**Status:** ready-for-agent

- [ ] Creating an entry captures the device's current GPS coordinates (with permission)
- [ ] Coordinates are reverse-geocoded via Mapbox into a suggested place name
- [ ] The caregiver can edit the suggested name or enter one manually
- [ ] Logging again at a previously used place (matched by Mapbox place ID) reuses the existing Location record rather than creating a duplicate
- [ ] Places without a Mapbox match fall back to a custom Location record
- [ ] Integration test: Locations are scoped to household
