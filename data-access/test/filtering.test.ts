import { describe, expect, it } from "vitest";
import { filterLogEntries, type LogEntryWithFood } from "../src/filtering.js";
import type { LogEntry } from "../src/logEntries.js";

function makeEntry(overrides: Partial<LogEntry> & { foodName?: string; categoryId?: string }): LogEntryWithFood {
  const { foodName = "Oscar Mayer Classic", categoryId = "category-protein", ...entryOverrides } = overrides;
  const entry: LogEntry = {
    id: "entry-1",
    householdId: "household-1",
    foodId: "food-1",
    childId: "child-1",
    status: "liked",
    reasonTagIds: ["reason-texture"],
    notes: null,
    intensity: null,
    occurredAt: "2026-01-15T12:00:00.000Z",
    locationId: null,
    createdBy: "caregiver-1",
    createdAt: "2026-01-15T12:00:00.000Z",
    ...entryOverrides,
  };
  return { entry, food: { id: entry.foodId, name: foodName, categoryId } };
}

describe("filterLogEntries", () => {
  it("returns every entry when no filters and no search text are active", () => {
    const liked = makeEntry({ id: "entry-liked", status: "liked" });
    const disliked = makeEntry({ id: "entry-disliked", status: "disliked" });

    const result = filterLogEntries([liked, disliked], {});

    expect(result).toEqual([liked, disliked]);
  });

  it("filters by a single status", () => {
    const liked = makeEntry({ id: "entry-liked", status: "liked" });
    const disliked = makeEntry({ id: "entry-disliked", status: "disliked" });

    const result = filterLogEntries([liked, disliked], { statuses: ["liked"] });

    expect(result).toEqual([liked]);
  });

  it("combines multiple statuses as OR -- matches any selected status", () => {
    const liked = makeEntry({ id: "entry-liked", status: "liked" });
    const disliked = makeEntry({ id: "entry-disliked", status: "disliked" });
    const inconsistent = makeEntry({ id: "entry-inconsistent", status: "inconsistent" });

    const result = filterLogEntries([liked, disliked, inconsistent], { statuses: ["liked", "disliked"] });

    expect(result).toEqual([liked, disliked]);
  });

  it("filters by category, matching the entry's Food category", () => {
    const protein = makeEntry({ id: "entry-protein", categoryId: "category-protein" });
    const veggie = makeEntry({ id: "entry-veggie", categoryId: "category-veggie" });

    const result = filterLogEntries([protein, veggie], { categoryIds: ["category-veggie"] });

    expect(result).toEqual([veggie]);
  });

  it("combines multiple categories as OR", () => {
    const protein = makeEntry({ id: "entry-protein", categoryId: "category-protein" });
    const veggie = makeEntry({ id: "entry-veggie", categoryId: "category-veggie" });
    const dairy = makeEntry({ id: "entry-dairy", categoryId: "category-dairy" });

    const result = filterLogEntries([protein, veggie, dairy], {
      categoryIds: ["category-protein", "category-dairy"],
    });

    expect(result).toEqual([protein, dairy]);
  });

  it("filters by reason tag, matching if the entry has any selected tag (OR)", () => {
    const texture = makeEntry({ id: "entry-texture", reasonTagIds: ["reason-texture"] });
    const taste = makeEntry({ id: "entry-taste", reasonTagIds: ["reason-taste"] });
    const both = makeEntry({ id: "entry-both", reasonTagIds: ["reason-texture", "reason-taste"] });
    const neither = makeEntry({ id: "entry-neither", reasonTagIds: ["reason-smell"] });

    const result = filterLogEntries([texture, taste, both, neither], {
      reasonTagIds: ["reason-texture", "reason-taste"],
    });

    expect(result).toEqual([texture, taste, both]);
  });

  it("filters by child", () => {
    const alex = makeEntry({ id: "entry-alex", childId: "child-alex" });
    const bailey = makeEntry({ id: "entry-bailey", childId: "child-bailey" });

    const result = filterLogEntries([alex, bailey], { childIds: ["child-bailey"] });

    expect(result).toEqual([bailey]);
  });

  it("filters by location, excluding entries with no captured location", () => {
    const home = makeEntry({ id: "entry-home", locationId: "location-home" });
    const grandma = makeEntry({ id: "entry-grandma", locationId: "location-grandma" });
    const none = makeEntry({ id: "entry-none", locationId: null });

    const result = filterLogEntries([home, grandma, none], { locationIds: ["location-home"] });

    expect(result).toEqual([home]);
  });

  it("filters by an inclusive occurredAt date range", () => {
    const before = makeEntry({ id: "entry-before", occurredAt: "2026-01-01T00:00:00.000Z" });
    const during = makeEntry({ id: "entry-during", occurredAt: "2026-01-15T00:00:00.000Z" });
    const after = makeEntry({ id: "entry-after", occurredAt: "2026-02-01T00:00:00.000Z" });

    const result = filterLogEntries([before, during, after], {
      occurredFrom: "2026-01-10T00:00:00.000Z",
      occurredTo: "2026-01-20T00:00:00.000Z",
    });

    expect(result).toEqual([during]);
  });

  it("combines different filter types as AND -- an entry must match every active type", () => {
    const matches = makeEntry({ id: "entry-matches", status: "liked", childId: "child-alex" });
    const wrongStatus = makeEntry({ id: "entry-wrong-status", status: "disliked", childId: "child-alex" });
    const wrongChild = makeEntry({ id: "entry-wrong-child", status: "liked", childId: "child-bailey" });

    const result = filterLogEntries([matches, wrongStatus, wrongChild], {
      statuses: ["liked"],
      childIds: ["child-alex"],
    });

    expect(result).toEqual([matches]);
  });

  it("matches free-text search against the Food name, case-insensitively", () => {
    const oscarMayer = makeEntry({ id: "entry-om", foodName: "Oscar Mayer Classic" });
    const ballpark = makeEntry({ id: "entry-bp", foodName: "Ballpark Angus" });

    const result = filterLogEntries([oscarMayer, ballpark], {}, "oscar");

    expect(result).toEqual([oscarMayer]);
  });

  it("applies free-text search alongside active filters (AND)", () => {
    const matches = makeEntry({ id: "entry-matches", foodName: "Oscar Mayer Classic", status: "liked" });
    const wrongStatus = makeEntry({ id: "entry-wrong-status", foodName: "Oscar Mayer Classic", status: "disliked" });
    const wrongName = makeEntry({ id: "entry-wrong-name", foodName: "Ballpark Angus", status: "liked" });

    const result = filterLogEntries([matches, wrongStatus, wrongName], { statuses: ["liked"] }, "oscar");

    expect(result).toEqual([matches]);
  });
});
