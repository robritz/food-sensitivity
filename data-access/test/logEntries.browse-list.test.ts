import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import { addLogEntry, listFoodStatusSummary, listLogEntries } from "../src/logEntries.js";
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

/** Adds a food to `client`'s household using a predefined category, for
 * tests that only care about log entries. */
async function seedFood(client: DataAccessClient, name = "Oscar Mayer Classic") {
  const protein = await findCategory(client, "Protein");
  return addFood(client, { categoryId: protein.id, name });
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("listFoodStatusSummary", () => {
  it("returns one row per Food/Child pair, with the most recent status", async () => {
    const founder = await signUpFixture("Household Browsing Summary");
    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const food = await seedFood(founder.client);
    const texture = await findReasonTag(founder.client, "Texture");
    const taste = await findReasonTag(founder.client, "Taste");

    await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });
    const mostRecent = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "disliked",
      reasonTagIds: [taste.id],
      notes: "Changed their mind this time",
    });

    const summary = await listFoodStatusSummary(founder.client);

    const rowsForPair = summary.filter((row) => row.foodId === food.id && row.childId === child.id);
    expect(rowsForPair).toHaveLength(1);
    expect(rowsForPair[0].status).toBe("disliked");
    expect(rowsForPair[0].latestEntryId).toBe(mostRecent.id);
  });

  it("lists a separate row per child for the same Food", async () => {
    const founder = await signUpFixture("Household Browsing Multiple Children");
    const childA = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const childB = await addChild(founder.client, { name: "Bailey", birthdate: "2021-02-02" });
    const food = await seedFood(founder.client);
    const texture = await findReasonTag(founder.client, "Texture");

    await addLogEntry(founder.client, {
      foodId: food.id,
      childId: childA.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });
    await addLogEntry(founder.client, {
      foodId: food.id,
      childId: childB.id,
      status: "inconsistent",
      reasonTagIds: [texture.id],
    });

    const summary = await listFoodStatusSummary(founder.client);
    const rowsForFood = summary.filter((row) => row.foodId === food.id);

    expect(rowsForFood).toHaveLength(2);
    expect(rowsForFood.find((row) => row.childId === childA.id)?.status).toBe("liked");
    expect(rowsForFood.find((row) => row.childId === childB.id)?.status).toBe("inconsistent");
  });

  it("scopes summary rows to household -- another household's Foods/entries aren't visible", async () => {
    const householdA = await signUpFixture("Household A Browse Summary");
    const householdB = await signUpFixture("Household B Browse Summary");
    const childA = await addChild(householdA.client, { name: "Only In A", birthdate: "2020-01-01" });
    const foodA = await seedFood(householdA.client, "Food Only In A");
    const texture = await findReasonTag(householdA.client, "Texture");
    await addLogEntry(householdA.client, {
      foodId: foodA.id,
      childId: childA.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    const summarySeenByB = await listFoodStatusSummary(householdB.client);

    expect(summarySeenByB.map((row) => row.foodId)).not.toContain(foodA.id);
  });
});

describe("listLogEntries filtered by Food/Child", () => {
  it("returns the full chronological history for a single Food/Child pair", async () => {
    const founder = await signUpFixture("Household Browsing History");
    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const food = await seedFood(founder.client);
    const otherFood = await seedFood(founder.client, "Ballpark Angus");
    const texture = await findReasonTag(founder.client, "Texture");

    const first = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });
    const second = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "disliked",
      reasonTagIds: [texture.id],
    });
    // Noise: a different food for the same child, which shouldn't show up.
    await addLogEntry(founder.client, {
      foodId: otherFood.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    const history = await listLogEntries(founder.client, { foodId: food.id, childId: child.id });

    expect(history.map((e) => e.id)).toEqual([second.id, first.id]);
  });

  it("scopes history to household -- another household's entries for a matching Food/Child id aren't visible", async () => {
    const householdA = await signUpFixture("Household A Browse History");
    const householdB = await signUpFixture("Household B Browse History");
    const childA = await addChild(householdA.client, { name: "Child A", birthdate: "2020-01-01" });
    const foodA = await seedFood(householdA.client, "Food In A");
    const texture = await findReasonTag(householdA.client, "Texture");
    await addLogEntry(householdA.client, {
      foodId: foodA.id,
      childId: childA.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    const historySeenByB = await listLogEntries(householdB.client, { foodId: foodA.id, childId: childA.id });

    expect(historySeenByB).toEqual([]);
  });
});
