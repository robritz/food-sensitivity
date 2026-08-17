# 05 — Child profiles

**What to build:** A caregiver can add and view child profiles within their household, each with a name and birthdate.

**Blocked by:** 03 (Auth & household creation)

**Status:** done — implemented on `feature/05-child-profiles`, not yet merged

- [x] A caregiver can add a child with a name and birthdate
- [x] A caregiver can view the list of children in their household
- [x] Child records are scoped to the household (RLS) and visible to all its caregivers
- [x] Integration test covering create, list, and household scoping

**Implementation notes:**
- New `child` table + RLS, following the same `household_id` + `current_household_id()` pattern as `household`/`caregiver`. Only select/insert policies exist -- editing/deleting a child isn't in scope for this ticket.
- New data-access exports: `addChild`, `listChildren`. `addChild` derives the household from the caller's own session (via `getCurrentCaregiver`) rather than taking it as input, so a caregiver can't add a child to a household they don't belong to.
- New page `/children` (behind `RequireAuth`), linked from the home screen.
