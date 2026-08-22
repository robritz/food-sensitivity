# UX improvements

**What to build:** N/A — a running list of smaller usability/interaction improvements noticed while implementing other tickets. Items here aren't scoped or estimated; triage into their own ticket before picking one up.

**Status:** needs-triage

- [ ] Broaden the "child" model to a "family member" model so adults (e.g. a caregiver with their own sensory profile) can be tracked alongside kids, not just children. This is more than a rename: the `child` table/`Child` type (`data-access/src/children.ts`), `ChildrenPage.tsx`, and every `childId`/`child_id` threaded through log entries, filtering, and export (`data-access/src/logEntries.ts`, `data-access/src/filtering.ts`, `src/lib/export.ts`) all assume the tracked person is a child (e.g. `birthdate` field, page titled "Children"). Needs a migration plus a pass through all of the above and their tests.
- [ ] Show entry photos anywhere a food/entry detail modal is shown, not just `LogPage`'s single-entry detail view (ticket 17, `viewingPhotos`/`getLogEntryPhotoUrl`). `BrowsePage.tsx`'s food/child detail `Dialog` (~line 438) and `MapPage.tsx`'s pin-detail `Dialog` (both list entries with status/notes) currently render no photos at all, even for entries that have them.
- [ ] In `BrowsePage.tsx`'s food/child detail dialog (~line 459), show each entry's logged location with a link to open it in Google Maps. `locations` is already loaded (currently only feeds the Location filter dropdown) and each `Location` has `latitude`/`longitude` (`data-access/src/locations.ts`), so the row can be resolved via `entry.locationId` and linked as `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` -- no existing helper builds a Maps link, so this is new.
