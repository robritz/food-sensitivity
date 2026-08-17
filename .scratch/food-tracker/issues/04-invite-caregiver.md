# 04 — Invite caregiver by email

**What to build:** A caregiver can invite another caregiver into their household by email; the invitee receives a link, creates their own account, and joins the same household automatically.

**Blocked by:** 03 (Auth & household creation)

**Status:** done — implemented on `main`

- [x] A caregiver can enter another person's email to send a household invite
- [x] The invitee receives an invite link (via Supabase Auth invite or equivalent)
- [x] Following the link lets the invitee create their own account
- [x] Upon account creation, the invitee is added as a caregiver in the inviting household, not a new household
- [x] Integration test: the invited caregiver can read/write household data; a caregiver outside the household still cannot

**Implementation notes:**
- New `household_invite` table + RLS: a caregiver insert policy lets a caller join an existing household only if a pending invite matches their own *verified* auth email (`auth.email()`), not client-editable metadata.
- Sending the actual invite email requires `admin.inviteUserByEmail`, which needs the service-role key -- added a `supabase/functions/invite-caregiver` Edge Function for that one privileged step; it still authorizes the invite itself (the `household_invite` insert) through the caller's own RLS-scoped session.
- New data-access exports: `inviteCaregiverByEmail`, `acceptHouseholdInvite`.
- New pages: `/invite` (send an invite, behind `RequireAuth`) and `/accept-invite` (set a password + display name after following the link; not behind `RequireAuth` since the invitee has a session but no caregiver row yet).
- `supabase/config.toml`: `site_url`/`additional_redirect_urls` updated to match the actual Vite dev origin (`localhost:5173`), which the invite redirect must be allow-listed against.
