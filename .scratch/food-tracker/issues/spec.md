---
title: Food Sensory Tracker — v1
labels: [ready-for-agent]
---

## Problem Statement

Kids with strong sensory challenges around food (texture/feel, smell, and taste — sensitive enough to tell two different brands of hot dog apart) make grocery shopping and eating out a guessing game. The foods they'll actually eat are hard-won discoveries, but there's no reliable way to remember which specific brand or product worked, where it was bought, what it looked like, or why it succeeded or failed. The reasons a food is accepted or refused (a texture, a smell, a temperature) get forgotten, and a good find at a specific store often can't be located again.

## Solution

A mobile-first app for logging foods the kids have tried. Each log entry captures the specific food (down to brand/product, not just a general category), a status (Liked / Disliked / Inconsistent), the sensory reasons behind that status, an optional photo, and where it was bought — captured via GPS and shown on a map. Entries build an append-only history per food per child, so opinions over time are preserved rather than overwritten. The log can be filtered, searched, and exported to share with a feeding therapist or pediatrician.

## User Stories

**Household & accounts**

1. As a parent, I want to create a household, so that my family's food log has a private space to live in.
2. As a parent, I want to invite another caregiver (spouse, grandparent, babysitter) to my household by email, so that they can log foods too when I'm not present.
3. As an invited caregiver, I want to receive an invite link and create my own account, so that I can join the household without sharing a password with anyone.
4. As a caregiver, I want to log in with my own account, so that entries I create are attributed to me.
5. As a caregiver, I want to add a child profile to the household with a name and birthdate, so that entries can be tracked per child and their age at the time of each entry is known.
6. As a caregiver, I want to add more than one child to the household, so that I can track multiple kids' preferences independently.

**Logging a food**

7. As a caregiver, I want to create a new log entry for a food, so that I can record whether a specific child liked or disliked it.
8. As a caregiver, I want to search for a food I've logged before by brand/product name as I type, so that I can reuse the existing Food record instead of creating a duplicate.
9. As a caregiver, I want to create a brand-new Food record (category + specific brand/product name) when the food hasn't been logged before, so that every food is tracked at the granularity that actually matters (e.g., "Oscar Mayer Classic" vs. "Ballpark Angus," not just "hot dog").
10. As a caregiver, I want to assign a category to a food from a predefined list, so that I can browse and filter by food type.
11. As a caregiver, I want to add a custom category when none of the predefined ones fit, so that the taxonomy can grow with what we actually encounter.
12. As a caregiver, I want custom categories I add to be visible to every household member, so that the whole family shares one consistent list.
13. As a caregiver, I want to set a status of Liked, Disliked, or Inconsistent for the entry, so that I can capture cases where the reaction wasn't clear-cut.
14. As a caregiver, I want to select one or more sensory reason tags (Texture, Smell, Taste, Appearance, Temperature, Sound/Crunch) for the entry, so that I can capture *why* the food succeeded or failed.
15. As a caregiver, I want the same set of reason tags to be available regardless of whether the status is Liked or Disliked, so that I can note, for example, that a food was loved *because* of its texture, not just hated because of it.
16. As a caregiver, I want to add a custom reason tag when the predefined set doesn't capture what happened, so that the vocabulary can grow with our experience.
17. As a caregiver, I want to optionally rate the intensity of the reaction on a 1–5 scale, so that I can distinguish "pushed it to the side of the plate" from "gagged and refused to stay at the table."
18. As a caregiver, I want to add freeform notes to an entry, so that I can capture nuance a tag can't ("fine warm, refused once it cooled").
19. As a caregiver, I want to be prompted to add a note when I select Inconsistent status, so that the variability behind that status doesn't get lost.
20. As a caregiver, I want to attach up to four photos to an entry (e.g., the packaging and the food itself), so that I can visually recognize the product later.
21. As a caregiver, I want to set the date the food was actually tried (defaulting to now, editable to a past date), so that logging a few days late doesn't distort the history.
22. As a caregiver, I want my current GPS location to be captured automatically when I create an entry, so that I don't have to type the location manually while I'm out.
23. As a caregiver, I want the captured GPS location to be turned into a suggested place name (e.g., "Trader Joe's – Main St") via reverse geocoding, so that I can confirm it instead of typing it from scratch.
24. As a caregiver, I want to edit the suggested location name, or enter one manually, so that I can correct it when the auto-suggestion is wrong or unavailable.
25. As a caregiver, I want to reuse an existing Location record when logging at a place I've logged at before, so that all entries from the same place are grouped together rather than fragmented by slightly different GPS coordinates.
26. As a caregiver, I want to create an entry while offline (e.g., no signal inside a store), so that a weak connection doesn't stop me from logging in the moment.
27. As a caregiver, I want offline entries to sync automatically once connectivity returns, so that I don't have to remember to do anything manually.
28. As a caregiver, I want to log the same food again on a later occasion as a new entry rather than overwriting the old one, so that I can see how a child's opinion of a food has changed over time.
29. As a caregiver, I want to edit or delete a log entry I or another household member created, so that mistakes (wrong food selected, blurry photo, wrong category) can be corrected.

**Browsing, filtering, and searching**

30. As a caregiver, I want to see a list of foods, one row per Food showing its most recent status and which child it applies to, so that I can quickly check "what does my kid currently think of X."
31. As a caregiver, I want to tap into a Food to see its full history of log entries, so that I can see how opinion of it has changed over time and across children.
32. As a caregiver, I want to filter the food list by status, category, reason, child, location, and date range, so that I can narrow down to exactly what I'm looking for (e.g., "all Disliked snacks for Emma logged in the last month").
33. As a caregiver, I want to select multiple values within one filter (e.g., Category = Fruit or Vegetable), so that I'm not restricted to one value per filter type.
34. As a caregiver, I want filters across different filter types to combine as AND (e.g., Category=Fruit AND Status=Liked AND Child=Emma), so that combining filters narrows results the way I'd expect.
35. As a caregiver, I want to free-text search by food name or brand, so that I can find something quickly when I remember its name but not its category.

**Map**

36. As a caregiver, I want to see a map with one pin per location I've logged food at, so that I can see at a glance where we've found good (and bad) foods.
37. As a caregiver, I want each pin to be color-coded by the statuses of foods logged there, so that I can tell at a glance whether a place has been a good source of accepted foods.
38. As a caregiver, I want to tap a pin to see a list of the foods logged at that location, so that I can review everything we've tried there without the map getting cluttered with overlapping pins.

**Sharing**

39. As a caregiver, I want to export a filtered set of entries (by child and/or date range) as a PDF including photo thumbnails, so that I can share a visual record with a feeding therapist or pediatrician.
40. As a caregiver, I want to export the same filtered data as a CSV without photos, so that I have a plain data version for my own records or other tools.

## Implementation Decisions

**Platform & stack**
- Vite + React + TypeScript single-page app, packaged as an installable PWA (manifest + service worker), mobile-first responsive layout.
- Supabase as the backend: Postgres (data), Supabase Auth (individual caregiver accounts), Supabase Storage (photos).
- Mapbox for map rendering, forward/reverse geocoding, and place lookup.
- Local-first write queue (e.g., IndexedDB) for offline entry creation; queued entries sync to Supabase automatically on reconnect.

**Data model**
- `Household`: the top-level tenant. Owns caregivers, children, the Food catalog, the Location catalog, custom categories, and custom reason tags.
- `Caregiver` (account): belongs to exactly one household (v1 scope); created via email invite flow.
- `Child`: belongs to a household; has name and birthdate.
- `Food`: belongs to a household (shared catalog, not per-child); has a category (predefined or custom) and a specific brand/product name. Searchable via typeahead when creating a new LogEntry, to prevent duplicate/fragmented records for the same product.
- `Location`: belongs to a household (shared catalog); normalized place record, matched by Mapbox place ID where available, with a custom fallback record for places without a Mapbox match (e.g., a private residence).
- `LogEntry`: the append-only unit of history. References one `Food`, one `Child`, and one `Location`. Fields: `status` (Liked / Disliked / Inconsistent), optional `intensity` (1–5), one or more `reason` tags, optional freeform `notes`, 0–4 photos, `date_happened` (defaults to creation time, editable), `created_by` (caregiver), `created_at`.
- `Category` and `ReasonTag`: each has a predefined system-seeded set plus household-scoped custom additions, visible to all caregivers in the household.
- A Food's "current status" per child is derived (most recent `LogEntry` for that Food+Child pair), not stored — history is never overwritten.
- Row Level Security (RLS) scopes all reads/writes to the caller's household, which is also what makes a future multi-household/public rollout a matter of removing restrictions rather than re-architecting.

**Data-access layer**
- A single application-level data-access module wraps all Supabase interaction: auth/session, household and child management, Food/Location catalog search and creation, LogEntry CRUD, photo upload, and export generation. UI components call this layer and render its results; they do not talk to the Supabase client directly. This is the one seam the app is built and tested against.

**Filtering & search**
- Filters: status, category, reason, child, location, date range. Multiple selected values within one filter type combine as OR; different filter types combine as AND.
- Free-text search matches against Food name/brand, complementing (not replacing) structured filters, and reuses the same search used for the Food typeahead during entry creation.

**Map**
- Pins are per-Location (not per-entry). Pin color reflects the mix of statuses logged at that location. Tapping a pin opens a list of Foods logged there with per-entry status.

**Export**
- PDF export: filtered by child and/or date range, includes photo thumbnails, structured for readability by a non-technical reader (e.g., a therapist).
- CSV export: same filter options, structured data only, no photos.

## Testing Decisions

- Tests target the data-access layer as the single seam, run as integration tests against a local Supabase instance (via the Supabase CLI's `supabase start`), not against mocks — this exercises real Postgres constraints, RLS policies, and storage behavior rather than assumptions about them.
- Good tests here assert observable behavior of the data-access layer's public functions (e.g., "creating a LogEntry with a past `date_happened` is retrievable and doesn't affect other entries' derived current-status," "a caregiver from Household A cannot read Household B's Food catalog") rather than asserting on internal query shape.
- RLS policies are tested directly: attempt cross-household reads/writes and assert they're rejected, since this is the mechanism the whole multi-tenancy story depends on.
- Offline queue/sync behavior is tested at the same seam: queue an entry while "offline" (sync disabled), assert it isn't yet in Supabase, re-enable sync, assert it lands correctly and only once (no duplicate on reconnect).
- No prior art in this repo — this is a greenfield project, so the first test file establishes the pattern (local Supabase fixture spun up per test run, data-access functions called directly, assertions against returned data and direct Postgres reads).
- UI components are not the primary target of automated testing for v1, per the confirmed single-seam decision; manual verification in the browser is the check for UI correctness.

## Out of Scope

- Multi-household / public product rollout — the data model and RLS are designed to support it later, but no signup flow, billing, or cross-household features are built now.
- Auto-generated pattern/trend analysis (e.g., "8 of 10 liked foods were crunchy") — deferred until there's enough logged data for it to be meaningful.
- Household administration beyond invite-by-email: no member removal, ownership transfer, or household renaming in v1.
- Notifications or reminders of any kind.
- Deletion of Food or Location catalog records themselves (only LogEntry deletion is in scope) — catalog cleanup is deferred.
- Conflict resolution beyond last-write-wins for the rare case of the same entry being edited from two offline devices before either syncs.

## Further Notes

- The household + RLS model is a deliberate hedge: it costs nothing extra to build now and preserves the option to open this up as a shared product for other parents later, per the user's explicit wish to "keep the door open."
- Category and reason-tag seeding (the initial predefined lists) should ship with sensible defaults (Categories: Protein, Fruit, Vegetable, Snack, Dairy, Grain, Beverage; Reasons: Texture, Smell, Taste, Appearance, Temperature, Sound/Crunch) but both lists are designed to be extended by the household, not fixed.
- Full design-tree discussion (including rejected alternatives, like a shared-login household model and per-child-only Food catalogs) lives in the `/grill-me` transcript that produced this spec, for reference if a future decision needs to revisit *why*.
