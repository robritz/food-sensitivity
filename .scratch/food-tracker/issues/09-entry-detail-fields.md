# 09 — Entry detail fields: intensity, backdating, photos

**What to build:** Log entries support an optional 1–5 intensity rating, a prompted note when status is Inconsistent, an editable "date happened" field, and up to 4 attached photos stored in Supabase Storage.

**Blocked by:** 06 (Core log entry)

**Status:** ready-for-agent

- [ ] A caregiver can optionally set an intensity rating (1–5) on an entry
- [ ] Selecting "Inconsistent" status prompts (but does not require) a note
- [ ] "Date happened" defaults to now but is editable to a past date
- [ ] A caregiver can attach up to 4 photos to an entry, uploaded to Supabase Storage
- [ ] Integration test: photos are only retrievable by caregivers within the owning household
