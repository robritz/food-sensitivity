# UX improvements

**What to build:** N/A — a running list of smaller usability/interaction improvements noticed while implementing other tickets. Items here aren't scoped or estimated; triage into their own ticket before picking one up.

**Status:** needs-triage

- [ ] Set focus to the "Name" field after adding a child on `ChildrenPage` (`src/pages/ChildrenPage.tsx`), so adding several children in a row doesn't require re-clicking into the field each time.
- [ ] Convert the food picker on `LogPage` (`src/pages/LogPage.tsx`) from a typeahead `Autocomplete` to a plain dropdown when offline. Ticket 11's offline logging only allows an existing Food, and the offline picker (see `filterFoodsOffline` in `src/lib/offlineFoodSearch.ts`) already filters the full in-memory list rather than searching a live index -- a dropdown of that same already-loaded list would be a more honest affordance than a typeahead text field, which implies a live search that isn't happening.
- [ ] Keep photos' original aspect ratio instead of forcing them into a fixed square. Two spots currently hard-code a square regardless of the source image's dimensions: `LogPage.tsx`'s photo detail/lightbox thumbnails (ticket 17, `sx={{ width: 96, height: 96, objectFit: 'cover' }}` -- crops rather than distorts, but still loses the edges of a non-square photo) and the ticket 16 PDF export's thumbnails (`buildExportPdf` in `src/lib/export.ts`, `doc.addImage(..., PDF_THUMBNAIL_MM, PDF_THUMBNAIL_MM)` -- actually stretches/distorts, since `addImage` scales width and height independently). Fixing the PDF case needs the image's natural dimensions (available once decoded client-side) to size the box proportionally before laying it out.
