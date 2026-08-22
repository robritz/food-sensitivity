# 25 — UX quick wins

**What to build:** Two small, self-contained usability fixes split out of the `ux-improvements.md` backlog. Independent of each other — either can be picked up alone.

**Status:** done -- implemented on `feat/25-ux-quick-wins`

- [x] Convert the food picker on `LogPage` (`src/pages/LogPage.tsx`) from a typeahead `Autocomplete` to a plain dropdown when offline. Ticket 11's offline logging only allows an existing Food, and the offline picker (see `filterFoodsOffline` in `src/lib/offlineFoodSearch.ts`) already filters the full in-memory list rather than searching a live index -- a dropdown of that same already-loaded list would be a more honest affordance than a typeahead text field, which implies a live search that isn't happening.
- [x] Keep photos' original aspect ratio instead of forcing them into a fixed square. Two spots currently hard-code a square regardless of the source image's dimensions: `LogPage.tsx`'s photo detail/lightbox thumbnails (ticket 17, `sx={{ width: 96, height: 96, objectFit: 'cover' }}` -- crops rather than distorts, but still loses the edges of a non-square photo) and the ticket 16 PDF export's thumbnails (`buildExportPdf` in `src/lib/export.ts`, `doc.addImage(..., PDF_THUMBNAIL_MM, PDF_THUMBNAIL_MM)` -- actually stretches/distorts, since `addImage` scales width and height independently). Fixing the PDF case needs the image's natural dimensions (available once decoded client-side) to size the box proportionally before laying it out.

**Implementation notes:**

- Offline food picker: `LogPage.tsx` renders the freeSolo `Autocomplete` (+ new-food category picker) only when online; offline it's a plain MUI `Select` over the already-loaded `foods`, with helper text noting new foods need a connection. The food-search effect bails before any network call while offline. The now-dead `filterFoodsOffline`/`src/lib/offlineFoodSearch.ts` + its test were deleted.
- Photo aspect ratio: `LogPage` detail thumbnails changed from `objectFit: 'cover'` on a fixed 96px square to `maxWidth/maxHeight: 96` (whole photo, no crop). PDF export (`src/lib/export.ts`) sizes each thumbnail via the new pure `fitWithinSquare(naturalW, naturalH, maxMm)` helper fed by jsPDF's synchronous `getImageProperties`, so non-square photos scale in proportion instead of stretching.
- Verification: `fitWithinSquare` unit-tested; a real 4x2 PNG exercises the export photo path. Frontend suite (39) + lint + typecheck + build all pass.
