# 11 — Offline entry creation & sync

**What to build:** A caregiver can create a full log entry (including photos and location) while offline; it queues locally and syncs automatically once connectivity returns, without creating duplicates.

**Blocked by:** 09 (Entry detail fields: intensity, backdating, photos), 10 (Location capture, reverse geocoding & reuse)

**Status:** ready-for-agent

- [ ] Creating an entry while offline succeeds locally and is visibly queued, not yet on the server
- [ ] Reconnecting triggers automatic sync of queued entries (including photos and location) to Supabase
- [ ] A synced entry appears exactly once — no duplicate on reconnect or repeated sync attempts
- [ ] Integration test simulating offline queue → reconnect → sync, asserting a single persisted copy
