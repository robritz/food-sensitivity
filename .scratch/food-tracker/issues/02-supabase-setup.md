# 02 — Supabase project setup & schema baseline

**What to build:** A provisioned Supabase project with the baseline schema (Household, Caregiver) and household-scoped Row Level Security, plus the skeleton of the application's data-access layer that all later tickets extend.

**Blocked by:** None — can start immediately.

**Status:** done — merged to main via PR #2, #3, #4

- [x] Supabase project created; connection config available via environment variables
- [x] `household` and `caregiver` tables exist, with caregiver linked to a Supabase Auth user
- [x] Row Level Security is enabled on all household-owned tables, scoping reads/writes to the caller's household
- [x] A local Supabase instance can be started via the Supabase CLI, for integration testing
- [x] The data-access layer skeleton exists as the single module future tickets extend, with an initial integration test proving RLS rejects cross-household access
