# 23 — Navigation & app structure

**What to build:** Two related navigation/structure changes, split out of the `ux-improvements.md` backlog so they can be picked up as one coherent piece of work (both touch top-level routing/layout).

**Status:** done -- implemented on `chore/23-navigation-structure`

- [x] Migrate navigation to a global hamburger nav instead of the current in-page navigation, so the same nav is available consistently across pages.
- [x] Make the map page (`MapPage.tsx`) the home page (i.e. the default/landing route) instead of whatever currently loads first.

**Implementation notes:**

- Nav destinations now live in one source of truth: `src/components/navItems.tsx` (`NAV_ITEMS` + `isNavItemActive`, unit-tested in `src/__tests__/navItems.test.ts`).
- `AppLayout.tsx` renders a hamburger `MenuIcon` opening a MUI `Drawer` (identity header + nav items + sign out), replacing the old back-arrow. Available on every page since all pages wrap in `AppLayout`.
- `App.tsx`: `/` renders `MapPage`; the old `/map` route and `HomePage.tsx` (the previous in-page nav) are deleted. Auth flows already `navigate('/')`, so post-login lands on the map.
- Verification: typecheck, oxlint, build, and full test suite (37 tests) all pass.
