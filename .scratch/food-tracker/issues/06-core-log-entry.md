# 06 — Core log entry: create a food and log a status

**What to build:** A caregiver can create a Food (category + specific brand/product) and log a LogEntry against it for a specific child, recording status (Liked/Disliked/Inconsistent), one or more sensory reason tags, and freeform notes. Entries are append-only history, visible in a basic chronological list.

**Blocked by:** 05 (Child profiles)

**Status:** ready-for-agent

- [ ] Predefined categories (Protein, Fruit, Vegetable, Snack, Dairy, Grain, Beverage) and reason tags (Texture, Smell, Taste, Appearance, Temperature, Sound/Crunch) are seeded
- [ ] A caregiver can create a new Food with a category and brand/product name
- [ ] A caregiver can create a LogEntry for a specific child referencing a Food, with status, one or more reason tags, and optional notes
- [ ] Creating a new entry for a Food/child pair that already has entries does not overwrite prior entries — history is preserved
- [ ] A basic chronological list of entries confirms persistence
- [ ] Integration test: entries and Foods are scoped to household, invisible outside it
