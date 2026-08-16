# 13 — Filtering & free-text search

**What to build:** The food list can be filtered by status, category, reason, child, location, and date range (multiple values within a filter type combine as OR, across types as AND), and searched by free text on food name/brand.

**Blocked by:** 12 (Food-grouped browse list)

**Status:** ready-for-agent

- [ ] Filters exist for status, category, reason, child, location, and date range
- [ ] Selecting multiple values within one filter type returns results matching any of them (OR)
- [ ] Combining filters across types narrows results to matching all of them (AND)
- [ ] Free-text search matches Food name/brand and works alongside active filters
- [ ] Integration test covering a combined filter + search scenario
