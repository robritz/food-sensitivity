import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import { addLogEntry, listLogEntries } from "../src/logEntries.js";
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

describe("predefined catalog", () => {
  it("seeds the predefined categories", async () => {
    const founder = await signUpFixture("Household For Catalog Check");
    const categories = await listCategories(founder.client);
    expect(categories.map((c) => c.name).sort()).toEqual(
      ["Beverage", "Dairy", "Fruit", "Grain", "Protein", "Snack", "Vegetable"],
    );
  });

  it("seeds the predefined reason tags", async () => {
    const founder = await signUpFixture("Household For Reason Tag Check");
    const reasonTags = await listReasonTags(founder.client);
    expect(reasonTags.map((t) => t.name).sort()).toEqual(
      ["Appearance", "Smell", "Sound/Crunch", "Taste", "Temperature", "Texture"],
    );
  });
});

describe("addFood", () => {
  it("creates a food with a category and brand/product name in the caller's household", async () => {
    const founder = await signUpFixture("Household Adding A Food");
    const protein = await findCategory(founder.client, "Protein");

    const food = await addFood(founder.client, { categoryId: protein.id, name: "Oscar Mayer Classic" });

    expect(food.name).toBe("Oscar Mayer Classic");
    expect(food.categoryId).toBe(protein.id);
    expect(food.householdId).toBe(founder.identity.householdId);
  });
});

describe("addLogEntry", () => {
  it("creates a log entry with status, reason tags, and notes for a child/food pair", async () => {
    const founder = await signUpFixture("Household Logging An Entry");
    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const food = await seedFood(founder.client);
    const texture = await findReasonTag(founder.client, "Texture");
    const smell = await findReasonTag(founder.client, "Smell");

    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id, smell.id],
      notes: "Ate the whole thing",
    });

    expect(entry.status).toBe("liked");
    expect(entry.reasonTagIds.sort()).toEqual([smell.id, texture.id].sort());
    expect(entry.notes).toBe("Ate the whole thing");
    expect(entry.householdId).toBe(founder.identity.householdId);
  });

  it("requires at least one reason tag", async () => {
    const founder = await signUpFixture("Household Missing Reason Tags");
    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const food = await seedFood(founder.client);

    await expect(
      addLogEntry(founder.client, { foodId: food.id, childId: child.id, status: "disliked", reasonTagIds: [] }),
    ).rejects.toThrow();
  });

  it("preserves prior entries -- logging the same food/child pair again adds new history, not an overwrite", async () => {
    const founder = await signUpFixture("Household Logging Repeatedly");
    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const food = await seedFood(founder.client);
    const texture = await findReasonTag(founder.client, "Texture");
    const taste = await findReasonTag(founder.client, "Taste");

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
      reasonTagIds: [taste.id],
      notes: "Changed their mind this time",
    });

    expect(first.id).not.toBe(second.id);

    const entries = await listLogEntries(founder.client);
    const idsForPair = entries.filter((e) => e.foodId === food.id && e.childId === child.id).map((e) => e.id);
    expect(idsForPair.sort()).toEqual([first.id, second.id].sort());

    const firstStillLiked = entries.find((e) => e.id === first.id);
    expect(firstStillLiked?.status).toBe("liked");
  });
});

describe("listLogEntries", () => {
  it("lists entries in reverse chronological order", async () => {
    const founder = await signUpFixture("Household Browsing Entries");
    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const foodA = await seedFood(founder.client, "Food A");
    const foodB = await seedFood(founder.client, "Food B");
    const texture = await findReasonTag(founder.client, "Texture");

    const older = await addLogEntry(founder.client, {
      foodId: foodA.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });
    const newer = await addLogEntry(founder.client, {
      foodId: foodB.id,
      childId: child.id,
      status: "disliked",
      reasonTagIds: [texture.id],
    });

    const entries = await listLogEntries(founder.client);
    const olderIndex = entries.findIndex((e) => e.id === older.id);
    const newerIndex = entries.findIndex((e) => e.id === newer.id);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  it("scopes foods and entries to household -- another household's data isn't visible", async () => {
    const householdA = await signUpFixture("Household A Logging");
    const householdB = await signUpFixture("Household B Logging");
    const childA = await addChild(householdA.client, { name: "Only In A", birthdate: "2020-01-01" });
    const foodA = await seedFood(householdA.client, "Food Only In A");
    const texture = await findReasonTag(householdA.client, "Texture");
    await addLogEntry(householdA.client, {
      foodId: foodA.id,
      childId: childA.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    const foodsSeenByB = await householdB.client.from("food").select().eq("household_id", householdA.identity.householdId);
    expect(foodsSeenByB.data).toHaveLength(0);

    const entriesSeenByB = await listLogEntries(householdB.client);
    expect(entriesSeenByB.map((e) => e.foodId)).not.toContain(foodA.id);
  });

  it("blocks creating a log entry against another household's food or child", async () => {
    const householdA = await signUpFixture("Household A Cross Scoping");
    const householdB = await signUpFixture("Household B Cross Scoping");
    const childA = await addChild(householdA.client, { name: "Child A", birthdate: "2020-01-01" });
    const foodA = await seedFood(householdA.client, "Food In A");
    const texture = await findReasonTag(householdA.client, "Texture");
    const childB = await addChild(householdB.client, { name: "Child B", birthdate: "2020-01-01" });
    const foodB = await seedFood(householdB.client, "Food In B");

    await expect(
      addLogEntry(householdB.client, {
        foodId: foodA.id,
        childId: childB.id,
        status: "liked",
        reasonTagIds: [texture.id],
      }),
    ).rejects.toThrow();

    await expect(
      addLogEntry(householdB.client, {
        foodId: foodB.id,
        childId: childA.id,
        status: "liked",
        reasonTagIds: [texture.id],
      }),
    ).rejects.toThrow();
  });
});
