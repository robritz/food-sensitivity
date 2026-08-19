import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import { addLogEntry, listFilteredLogEntries } from "../src/logEntries.js";
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

async function seedFood(client: DataAccessClient, categoryId: string, name = "Oscar Mayer Classic") {
  return addFood(client, { categoryId, name });
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("listFilteredLogEntries (ticket 16 export source)", () => {
  it("returns every matching entry, not collapsed to one per Food/Child pair", async () => {
    const founder = await signUpFixture("Household Export Full List");
    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const protein = await findCategory(founder.client, "Protein");
    const texture = await findReasonTag(founder.client, "Texture");
    const food = await seedFood(founder.client, protein.id);

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

    const entries = await listFilteredLogEntries(founder.client);

    expect(entries.map((e) => e.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    expect(entries).toHaveLength(2);
  });

  it("respects the child and date-range filter (ticket 16)", async () => {
    const founder = await signUpFixture("Household Export Child Date Filter");
    const alex = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const bailey = await addChild(founder.client, { name: "Bailey", birthdate: "2021-02-02" });
    const protein = await findCategory(founder.client, "Protein");
    const texture = await findReasonTag(founder.client, "Texture");
    const food = await seedFood(founder.client, protein.id);

    const inRange = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: alex.id,
      status: "liked",
      reasonTagIds: [texture.id],
      occurredAt: "2026-01-15T12:00:00.000Z",
    });
    // Wrong child.
    await addLogEntry(founder.client, {
      foodId: food.id,
      childId: bailey.id,
      status: "liked",
      reasonTagIds: [texture.id],
      occurredAt: "2026-01-15T12:00:00.000Z",
    });
    // Right child, outside date range.
    await addLogEntry(founder.client, {
      foodId: food.id,
      childId: alex.id,
      status: "disliked",
      reasonTagIds: [texture.id],
      occurredAt: "2026-03-01T12:00:00.000Z",
    });

    const entries = await listFilteredLogEntries(founder.client, {
      filters: { childIds: [alex.id], occurredFrom: "2026-01-01", occurredTo: "2026-01-31T23:59:59.999Z" },
    });

    expect(entries.map((e) => e.id)).toEqual([inRange.id]);
  });

  it("scopes results to household -- another household's matching entries aren't visible", async () => {
    const householdA = await signUpFixture("Household A Export Scoping");
    const householdB = await signUpFixture("Household B Export Scoping");
    const childA = await addChild(householdA.client, { name: "Child A", birthdate: "2020-01-01" });
    const proteinA = await findCategory(householdA.client, "Protein");
    const textureA = await findReasonTag(householdA.client, "Texture");
    const foodA = await seedFood(householdA.client, proteinA.id, "Food Only In A");
    await addLogEntry(householdA.client, {
      foodId: foodA.id,
      childId: childA.id,
      status: "liked",
      reasonTagIds: [textureA.id],
    });

    const entriesSeenByB = await listFilteredLogEntries(householdB.client);

    expect(entriesSeenByB.map((e) => e.foodId)).not.toContain(foodA.id);
  });
});
