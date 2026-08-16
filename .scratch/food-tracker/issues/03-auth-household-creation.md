# 03 — Auth & household creation

**What to build:** A caregiver can sign up, log in, create a household, and land on an empty authenticated home screen. This is the first real user-facing vertical slice, tying the app scaffold and Supabase setup together.

**Blocked by:** 01 (App scaffold), 02 (Supabase project setup & schema baseline)

**Status:** ready-for-agent

- [ ] A new user can sign up (email/password or magic link) via Supabase Auth
- [ ] Signing up creates a Caregiver record and a new Household, with the caregiver as its first member
- [ ] A returning caregiver can log in and reach their household's home screen
- [ ] The home screen is empty/placeholder but confirms the caregiver's identity and household
- [ ] Integration test: two caregivers in different households cannot see each other's household data
