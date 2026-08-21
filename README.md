# Food Sensory Tracker

A mobile-first app for logging foods that kids with sensory challenges (texture, smell, taste) have tried. Caregivers in a household record whether a specific food — down to brand/product, not just a category — was liked, disliked, or got an inconsistent reaction, along with the sensory reasons why, an optional intensity rating, notes, up to four photos, and the location it was bought (captured via GPS and reverse-geocoded to a place name). Entries are append-only, so a food's history of changing opinions over time is preserved rather than overwritten.

The app supports multiple caregivers per household (invite by email) and multiple children per household, tracked independently. Logged entries can be browsed, filtered (status/category/reason/child/location/date range), free-text searched, viewed on a map (one color-coded pin per location), and exported as a PDF (with photo thumbnails) or CSV to share with a feeding therapist or pediatrician. Entries created offline are queued locally and sync automatically once connectivity returns.

See `.scratch/food-tracker/issues/spec.md` for the full product spec, including data model and testing decisions.

## Stack

- Vite + React + TypeScript, packaged as an installable PWA (`vite-plugin-pwa`)
- `react-router-dom` for client-side routing
- Supabase (Postgres, Auth, Storage) as the backend, with Row Level Security scoping all data to a caregiver's household
- Mapbox for map rendering, geocoding, and place lookup
- A local write queue (IndexedDB) for offline entry creation, syncing to Supabase on reconnect
- `oxlint` for linting, `vitest` for tests

## Development

See `CLAUDE.md` for dev server, build, lint, and test commands.

## Status
This app is currently in early development.
