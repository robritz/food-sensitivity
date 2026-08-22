import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import { addLogEntry, listFoodStatusSummary } from "../src/logEntries.js";
import { findOrCreateLocation } from "../src/locations.js";
import type { DataAccessClient } from "../src/client.js";
import type { Category, ReasonTag } from "../src/catalog.js";
import { admin, signUpFixture as signUpHouseholdFixture } from "./helpers.js";

const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

function signUpFixture(householdName: string) {
  return signUpHouseholdFixture(householdName, createdUserIds, createdHouseholdIds);
}

async function findCategory(client: DataAccessClient, name: string): Promise<Category> {
  const categories = await listCategories(client);
  const category = categories.find((c) => c.name === name);
  if (!category) throw new Error(`Expected a seeded category named "${name}".`);
  return category;
}

async function findReasonTag(client: DataAccessClient, name: string): Promise<ReasonTag> {
  const reasonTags = await listReasonTags(client);
  const reasonTag = reasonTags.find((t) => t.name === name);
  if (!reasonTag) throw new Error(`Expected a seeded reason tag named "${name}".`);
  return reasonTag;
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("listFoodStatusSummary with filters + search (ticket 13)", () => {
  it("combines active filters (AND across types) with free-text search to narrow the browse list", async () => {
    const founder = await signUpFixture("Household Filter Search");
    const alex = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const bailey = await addChild(founder.client, { name: "Bailey", birthdate: "2021-02-02" });
    const protein = await findCategory(founder.client, "Protein");
    const veggie = await findCategory(founder.client, "Vegetable");
    const texture = await findReasonTag(founder.client, "Texture");
    const taste = await findReasonTag(founder.client, "Taste");
    const home = await findOrCreateLocation(founder.client, {
      name: "Home",
      latitude: 40.0,
      longitude: -75.0,
    });

    const hotDog = await addFood(founder.client, { categoryId: protein.id, name: "Oscar Mayer Classic" });
    const broccoli = await addFood(founder.client, { categoryId: veggie.id, name: "Ocean Spray Broccoli Bites" });

    // Matches every active filter type and the search text.
    const target = await addLogEntry(founder.client, {
      foodId: hotDog.id,
      childId: alex.id,
      status: "liked",
      reasonTagIds: [texture.id],
      locationId: home.id,
    });
    // Wrong status.
    await addLogEntry(founder.client, {
      foodId: hotDog.id,
      childId: alex.id,
      status: "disliked",
      reasonTagIds: [texture.id],
      locationId: home.id,
    });
    // Wrong child.
    await addLogEntry(founder.client, {
      foodId: hotDog.id,
      childId: bailey.id,
      status: "liked",
      reasonTagIds: [taste.id],
      locationId: home.id,
    });
    // Wrong category (food name doesn't match search either).
    await addLogEntry(founder.client, {
      foodId: broccoli.id,
      childId: alex.id,
      status: "liked",
      reasonTagIds: [texture.id],
      locationId: home.id,
    });

    const summary = await listFoodStatusSummary(founder.client, {
      filters: { statuses: ["liked"], categoryIds: [protein.id], childIds: [alex.id], locationIds: [home.id] },
      search: "oscar",
    });

    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ foodId: hotDog.id, childId: alex.id, latestEntryId: target.id });
  });

  it("keeps entries matching any selected value within a filter type (OR) while still applying search (AND)", async () => {
    const founder = await signUpFixture("Household Filter OR Search");
    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const protein = await findCategory(founder.client, "Protein");
    const texture = await findReasonTag(founder.client, "Texture");
    const food = await addFood(founder.client, { categoryId: protein.id, name: "Oscar Mayer Classic" });
    const otherFood = await addFood(founder.client, { categoryId: protein.id, name: "Ballpark Angus" });

    await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });
    const disliked = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "disliked",
      reasonTagIds: [texture.id],
    });
    // Matches the status OR-filter but not the search text -- excluded.
    await addLogEntry(founder.client, {
      foodId: otherFood.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    const summary = await listFoodStatusSummary(founder.client, {
      filters: { statuses: ["liked", "disliked"] },
      search: "oscar",
    });

    // Both liked and disliked entries are for the same Food/Child pair, so
    // they collapse to one summary row keyed on the most recent match.
    expect(summary).toHaveLength(1);
    expect(summary[0].foodId).toBe(food.id);
    expect(summary[0].latestEntryId).toBe(disliked.id);
    expect(summary.map((row) => row.foodId)).not.toContain(otherFood.id);
  });

  it("treats multiple selected children as overlap/AND -- only foods every selected child has logged (ticket 24)", async () => {
    const founder = await signUpFixture("Household Child Overlap");
    const alex = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const bailey = await addChild(founder.client, { name: "Bailey", birthdate: "2021-02-02" });
    const protein = await findCategory(founder.client, "Protein");
    const texture = await findReasonTag(founder.client, "Texture");
    const banana = await addFood(founder.client, { categoryId: protein.id, name: "Banana" });
    const apple = await addFood(founder.client, { categoryId: protein.id, name: "Apple" });
    const pear = await addFood(founder.client, { categoryId: protein.id, name: "Pear" });

    // Both children logged banana; only Alex logged apple, only Bailey logged pear.
    await addLogEntry(founder.client, { foodId: banana.id, childId: alex.id, status: "liked", reasonTagIds: [texture.id] });
    await addLogEntry(founder.client, { foodId: banana.id, childId: bailey.id, status: "liked", reasonTagIds: [texture.id] });
    await addLogEntry(founder.client, { foodId: apple.id, childId: alex.id, status: "liked", reasonTagIds: [texture.id] });
    await addLogEntry(founder.client, { foodId: pear.id, childId: bailey.id, status: "liked", reasonTagIds: [texture.id] });

    const summary = await listFoodStatusSummary(founder.client, {
      filters: { childIds: [alex.id, bailey.id] },
    });

    // Only banana is common to both -- one row per child for it, and no
    // apple/pear rows (foods only one of them logged).
    expect(summary.map((row) => row.foodId).sort()).toEqual([banana.id, banana.id].sort());
    expect(new Set(summary.map((row) => row.childId))).toEqual(new Set([alex.id, bailey.id]));
    expect(summary.map((row) => row.foodId)).not.toContain(apple.id);
    expect(summary.map((row) => row.foodId)).not.toContain(pear.id);
  });

  it("scopes filtered/searched results to household -- another household's matching data isn't visible", async () => {
    const householdA = await signUpFixture("Household A Filter Search");
    const householdB = await signUpFixture("Household B Filter Search");
    const childA = await addChild(householdA.client, { name: "Child A", birthdate: "2020-01-01" });
    const protein = await findCategory(householdA.client, "Protein");
    const texture = await findReasonTag(householdA.client, "Texture");
    const foodA = await addFood(householdA.client, { categoryId: protein.id, name: "Oscar Mayer Classic" });
    await addLogEntry(householdA.client, {
      foodId: foodA.id,
      childId: childA.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    const summarySeenByB = await listFoodStatusSummary(householdB.client, {
      filters: { statuses: ["liked"] },
      search: "oscar",
    });

    expect(summarySeenByB.map((row) => row.foodId)).not.toContain(foodA.id);
  });
});
