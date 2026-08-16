# 04 — Invite caregiver by email

**What to build:** A caregiver can invite another caregiver into their household by email; the invitee receives a link, creates their own account, and joins the same household automatically.

**Blocked by:** 03 (Auth & household creation)

**Status:** ready-for-agent

- [ ] A caregiver can enter another person's email to send a household invite
- [ ] The invitee receives an invite link (via Supabase Auth invite or equivalent)
- [ ] Following the link lets the invitee create their own account
- [ ] Upon account creation, the invitee is added as a caregiver in the inviting household, not a new household
- [ ] Integration test: the invited caregiver can read/write household data; a caregiver outside the household still cannot
