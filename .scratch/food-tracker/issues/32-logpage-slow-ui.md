# 32 — Investigate slow UI on the food log page

**What to build:** A diagnostic spike: figure out *why* the food log page (`src/pages/LogPage.tsx`) feels slow, quantify it, and land either the fix (if small/obvious) or a scoped follow-up ticket describing it. Output is a diagnosis, not a predetermined change.

**Status:** needs-info -- no repro/metrics captured yet; this ticket's first job is to produce them.

- [ ] Investigate slow UI on the food log page and record findings.

**Where to start (grounding):**

- `LogPage.tsx` is large and re-render-heavy: many `useState`, several debounced search effects (food search, Mapbox place search), per-keystroke Autocomplete filtering, a "which entries have photos" re-list on every `entries` change, and photo/file handling. Any of these could be the culprit.
- Likely suspects to measure before changing anything:
  - Re-renders of the whole page on each keystroke in the Food/Place autocompletes (React DevTools Profiler).
  - The `listLogEntryIdsWithPhotos` refetch effect keyed on `entries`.
  - Large `foods`/`entries` lists rendered without virtualization.
  - Mapbox Search Box request volume / debounce timing.
- Use the `diagnosing-bugs` skill's loop: reproduce, measure (Profiler + a production `npm run build` preview, not just dev), form a hypothesis, confirm, then fix or file.

**Definition of done:**

- A written diagnosis (what's slow, under what interaction, with numbers) added to this ticket, and either: (a) a small fix committed, or (b) a follow-up ticket with the concrete change scoped.

**Notes:**

- Overlaps with ticket 31 (LogPage state refactor) -- the re-render audit here should inform that refactor; consider doing this first.
- Measure against a production build; Vite dev-mode is not representative of runtime perf.
