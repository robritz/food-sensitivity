# Tech debt & follow-ups

**What to build:** N/A — a running list of smaller refactors, cleanups, and deferred concerns noticed while implementing other tickets. Items here aren't scoped or estimated; triage into their own ticket before picking one up.

**Status:** needs-triage

- [ ] Consider state handling on `LogPage` component (`src/pages/LogPage.tsx`) -- it's grown to ~12 pieces of `useState` across three responsibilities (add-food form, add-entry form, entries list). Worth revisiting once ticket 09 (intensity, backdating, photos) adds more fields to the entry form -- candidate to split into subcomponents or consolidate onto a reducer.
