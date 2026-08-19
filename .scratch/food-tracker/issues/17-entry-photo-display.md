# 17 — Entry photo display & single-entry detail view

**What to build:** Photos attached to a log entry (ticket 09) are uploaded but never shown anywhere, and there's no way to click through from the log list to a single entry's full detail. Add a way to view an entry's attached photos, and a click-through from the entry list to a single-entry detail view.

**Blocked by:** 09 (Entry detail fields — added photo upload with no corresponding display)

**Status:** ready-for-agent

- [ ] A caregiver can click/tap a logged entry in `LogPage.tsx`'s entry list to open a single-entry detail view
- [ ] The detail view renders any photos attached to that entry, fetched via `listLogEntryPhotos` + `getLogEntryPhotoUrl`
- [ ] Photos render at a reasonable size and can be opened larger (e.g. lightbox / full image)
- [ ] Zero-photo entries are handled gracefully (no broken image / empty state)

**Notes for whoever picks this up:**
- `listLogEntryPhotos` and `getLogEntryPhotoUrl` (`data-access/src/logEntries.ts`, ticket 09) already exist and are exported from `data-access/src/index.ts`, but no UI calls them yet — this is purely wiring existing data-access functions into a view, no new backend/migration work expected.
- `getLogEntryPhotoUrl` returns a signed URL that expires after 60s by default (bucket is private). Fetch it when the detail view opens rather than caching it in list state, since a stale URL will 403.
- Ticket 15 (edit/delete entries) separately flagged that photo *editing* (add/remove photos on an existing entry) isn't wired into the edit dialog either. That's a related but separate concern (editing vs. viewing) — likely wants to reuse whatever surface this ticket builds, but is not in scope here.
- Ticket 12's Browse page tap-through opens a per-Food/child history dialog (all entries for that Food+child pair), not a single-entry view — decide whether this ticket's detail view is reachable from there too, or is purely a `LogPage.tsx`-list affordance.
- Found while investigating a bug report: the "Add photo" upload itself was broken (`handlePhotoInputChange` read a live `FileList` after already resetting the input's `value`, so it always saw zero files) and has been fixed separately. This ticket is the follow-up gap discovered once upload started working — uploaded photos still don't render anywhere.
