import { describe, expect, it } from "vitest";
import { filterByChildOverlap, filterLogEntries, keysCommonToChildren, type LogEntryWithFood } from "../src/filtering.js";
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

  it("filters by a single child", () => {
    const alex = makeEntry({ id: "entry-alex", childId: "child-alex" });
    const bailey = makeEntry({ id: "entry-bailey", childId: "child-bailey" });

    const result = filterLogEntries([alex, bailey], { childIds: ["child-bailey"] });

    expect(result).toEqual([bailey]);
  });

  it("with multiple children, keeps only entries for foods every selected child has logged (AND/overlap)", () => {
    // Both children logged banana; only Alex logged apple, only Bailey logged pear.
    const alexBanana = makeEntry({ id: "e-ab", childId: "child-alex", foodId: "food-banana" });
    const alexApple = makeEntry({ id: "e-aa", childId: "child-alex", foodId: "food-apple" });
    const baileyBanana = makeEntry({ id: "e-bb", childId: "child-bailey", foodId: "food-banana" });
    const baileyPear = makeEntry({ id: "e-bp", childId: "child-bailey", foodId: "food-pear" });

    const result = filterLogEntries([alexBanana, alexApple, baileyBanana, baileyPear], {
      childIds: ["child-alex", "child-bailey"],
    });

    // Only the banana entries survive -- the one food both children logged.
    expect(result).toEqual([alexBanana, baileyBanana]);
  });

  it("with multiple children, excludes a non-selected child's entries even for an overlap food", () => {
    const alexBanana = makeEntry({ id: "e-ab", childId: "child-alex", foodId: "food-banana" });
    const baileyBanana = makeEntry({ id: "e-bb", childId: "child-bailey", foodId: "food-banana" });
    const caseyBanana = makeEntry({ id: "e-cb", childId: "child-casey", foodId: "food-banana" });

    const result = filterLogEntries([alexBanana, baileyBanana, caseyBanana], {
      childIds: ["child-alex", "child-bailey"],
    });

    expect(result).toEqual([alexBanana, baileyBanana]);
  });

  it("computes child overlap after other filter types (foods every child has *liked*)", () => {
    // Both like banana; Bailey only disliked apple, so apple isn't a liked-overlap food.
    const alexBananaLiked = makeEntry({ id: "e-abl", childId: "child-alex", foodId: "food-banana", status: "liked" });
    const alexAppleLiked = makeEntry({ id: "e-aal", childId: "child-alex", foodId: "food-apple", status: "liked" });
    const baileyBananaLiked = makeEntry({ id: "e-bbl", childId: "child-bailey", foodId: "food-banana", status: "liked" });
    const baileyAppleDisliked = makeEntry({ id: "e-bad", childId: "child-bailey", foodId: "food-apple", status: "disliked" });

    const result = filterLogEntries([alexBananaLiked, alexAppleLiked, baileyBananaLiked, baileyAppleDisliked], {
      statuses: ["liked"],
      childIds: ["child-alex", "child-bailey"],
    });

    expect(result).toEqual([alexBananaLiked, baileyBananaLiked]);
  });

  it("returns nothing when a selected child has logged none of the others' foods", () => {
    const alexBanana = makeEntry({ id: "e-ab", childId: "child-alex", foodId: "food-banana" });
    const baileyPear = makeEntry({ id: "e-bp", childId: "child-bailey", foodId: "food-pear" });

    const result = filterLogEntries([alexBanana, baileyPear], {
      childIds: ["child-alex", "child-bailey"],
    });

    expect(result).toEqual([]);
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

describe("keysCommonToChildren", () => {
  const pairs = [
    { foodId: "banana", childId: "alex" },
    { foodId: "apple", childId: "alex" },
    { foodId: "banana", childId: "bailey" },
    { foodId: "pear", childId: "bailey" },
  ];
  const foodKey = (p: { foodId: string }) => p.foodId;

  it("returns the keys a single child has", () => {
    expect(keysCommonToChildren(pairs, ["alex"], foodKey)).toEqual(new Set(["banana", "apple"]));
  });

  it("intersects keys across every selected child", () => {
    expect(keysCommonToChildren(pairs, ["alex", "bailey"], foodKey)).toEqual(new Set(["banana"]));
  });

  it("is empty when a selected child has nothing", () => {
    expect(keysCommonToChildren(pairs, ["alex", "nobody"], foodKey)).toEqual(new Set());
  });

  it("is empty for an empty child selection", () => {
    expect(keysCommonToChildren(pairs, [], foodKey)).toEqual(new Set());
  });

  it("ignores items whose key is null/undefined", () => {
    const withLocations = [
      { locationId: "home", childId: "alex" },
      { locationId: null, childId: "alex" },
      { locationId: "home", childId: "bailey" },
    ];
    expect(keysCommonToChildren(withLocations, ["alex", "bailey"], (i) => i.locationId)).toEqual(new Set(["home"]));
  });
});

describe("filterByChildOverlap", () => {
  const items = [
    { id: "1", foodId: "banana", childId: "alex" },
    { id: "2", foodId: "apple", childId: "alex" },
    { id: "3", foodId: "banana", childId: "bailey" },
    { id: "4", foodId: "pear", childId: "bailey" },
    { id: "5", foodId: "banana", childId: "casey" },
  ];
  const foodKey = (i: { foodId: string }) => i.foodId;

  it("returns all items unchanged when no children are selected", () => {
    expect(filterByChildOverlap(items, [], foodKey)).toEqual(items);
  });

  it("keeps a single child's own items", () => {
    expect(filterByChildOverlap(items, ["alex"], foodKey).map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("keeps only the selected children's items for keys all of them share", () => {
    expect(filterByChildOverlap(items, ["alex", "bailey"], foodKey).map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("overlaps on location when given a locationId key selector (the map's dimension)", () => {
    // Alex & Bailey both logged at home; only Alex at the park. Different
    // foods -- irrelevant here, the overlap is on location.
    const entries = [
      { id: "1", foodId: "banana", locationId: "home", childId: "alex" },
      { id: "2", foodId: "apple", locationId: "park", childId: "alex" },
      { id: "3", foodId: "pear", locationId: "home", childId: "bailey" },
    ];
    const result = filterByChildOverlap(entries, ["alex", "bailey"], (e) => e.locationId);
    expect(result.map((e) => e.id)).toEqual(["1", "3"]);
  });
});
