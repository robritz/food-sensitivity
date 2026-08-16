# 07 — Food catalog typeahead & reuse

**What to build:** When creating a log entry, a caregiver can search existing Foods by brand/product name as they type and reuse a matching Food instead of creating a duplicate.

**Blocked by:** 06 (Core log entry)

**Status:** ready-for-agent

- [ ] Typing in the Food field while creating an entry searches existing household Foods by name/brand
- [ ] Selecting a search result reuses the existing Food record for the new LogEntry
- [ ] A new Food is only created when no existing match is selected
- [ ] Integration test: search returns only the household's own Foods, not other households'
