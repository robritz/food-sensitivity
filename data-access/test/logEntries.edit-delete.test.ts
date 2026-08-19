import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import { addLogEntry, deleteLogEntry, listLogEntries, updateLogEntry } from "../src/logEntries.js";
import type { DataAccessClient } from "../src/client.js";
import type { Category, ReasonTag } from "../src/catalog.js";
import { addCaregiverToHousehold, admin, signUpFixture as signUpHouseholdFixture } from "./helpers.js";

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

async function seedFood(client: DataAccessClient, name = "Oscar Mayer Classic") {
  const protein = await findCategory(client, "Protein");
  return addFood(client, { categoryId: protein.id, name });
}

/** Sets up a household with a child, a food, and one logged entry (status
 * "liked", tagged Texture, notes "Ate the whole thing") -- the common
 * starting point most edit/delete tests build on. */
async function seedHouseholdWithEntry(householdName: string) {
  const founder = await signUpFixture(householdName);
  const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
  const food = await seedFood(founder.client);
  const texture = await findReasonTag(founder.client, "Texture");
  const entry = await addLogEntry(founder.client, {
    foodId: food.id,
    childId: child.id,
    status: "liked",
    reasonTagIds: [texture.id],
    notes: "Ate the whole thing",
  });
  return { founder, child, food, texture, entry };
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("updateLogEntry", () => {
  it("updates status and notes on an existing entry", async () => {
    const { founder, entry } = await seedHouseholdWithEntry("Household Editing Status And Notes");

    const updated = await updateLogEntry(founder.client, entry.id, {
      status: "disliked",
      notes: "Changed their mind",
    });

    expect(updated.id).toBe(entry.id);
    expect(updated.status).toBe("disliked");
    expect(updated.notes).toBe("Changed their mind");
    expect(updated.reasonTagIds).toEqual(entry.reasonTagIds);
  });

  it("clears notes when given null", async () => {
    const { founder, entry } = await seedHouseholdWithEntry("Household Clearing Notes");

    const updated = await updateLogEntry(founder.client, entry.id, { notes: null });

    expect(updated.notes).toBeNull();
  });

  it("replaces the full set of reason tags", async () => {
    const { founder, entry } = await seedHouseholdWithEntry("Household Editing Reason Tags");
    const smell = await findReasonTag(founder.client, "Smell");
    const taste = await findReasonTag(founder.client, "Taste");

    const updated = await updateLogEntry(founder.client, entry.id, {
      reasonTagIds: [smell.id, taste.id],
    });

    expect(updated.reasonTagIds.sort()).toEqual([smell.id, taste.id].sort());
  });

  it("requires at least one reason tag when reasonTagIds is provided", async () => {
    const { founder, entry } = await seedHouseholdWithEntry("Household Editing To Zero Reason Tags");

    await expect(updateLogEntry(founder.client, entry.id, { reasonTagIds: [] })).rejects.toThrow();
  });

  it("lets any household caregiver edit an entry, regardless of who created it", async () => {
    const { founder, entry } = await seedHouseholdWithEntry("Household Editing By Fellow Caregiver");
    const secondCaregiverClient = await addCaregiverToHousehold(founder.identity.householdId, createdUserIds);

    const updated = await updateLogEntry(secondCaregiverClient, entry.id, { status: "inconsistent" });

    expect(updated.status).toBe("inconsistent");
  });

  it("does not affect other entries for the same Food/Child pair", async () => {
    const { founder, child, food, texture, entry: first } = await seedHouseholdWithEntry(
      "Household Editing One Of Several Entries",
    );
    const second = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "disliked",
      reasonTagIds: [texture.id],
      notes: "Second try",
    });

    await updateLogEntry(founder.client, first.id, { status: "inconsistent", notes: "Edited" });

    const entries = await listLogEntries(founder.client);
    const untouchedSecond = entries.find((e) => e.id === second.id);
    expect(untouchedSecond?.status).toBe("disliked");
    expect(untouchedSecond?.notes).toBe("Second try");
  });

  it("blocks a caregiver outside the household from editing its entries", async () => {
    const { entry } = await seedHouseholdWithEntry("Household Protected From Edit By Outsider");
    const outsider = await signUpFixture("Outsider Household For Edit");

    await expect(updateLogEntry(outsider.client, entry.id, { status: "disliked" })).rejects.toThrow();

    // Confirm it truly wasn't changed, not just that the caller got an error.
    const { data: unchanged } = await admin.from("log_entry").select().eq("id", entry.id).single();
    expect(unchanged?.status).toBe("liked");
  });
});

describe("deleteLogEntry", () => {
  it("deletes an existing entry", async () => {
    const { founder, entry } = await seedHouseholdWithEntry("Household Deleting An Entry");

    await deleteLogEntry(founder.client, entry.id);

    const entries = await listLogEntries(founder.client);
    expect(entries.map((e) => e.id)).not.toContain(entry.id);
  });

  it("lets any household caregiver delete an entry, regardless of who created it", async () => {
    const { founder, entry } = await seedHouseholdWithEntry("Household Deleting By Fellow Caregiver");
    const secondCaregiverClient = await addCaregiverToHousehold(founder.identity.householdId, createdUserIds);

    await deleteLogEntry(secondCaregiverClient, entry.id);

    const entries = await listLogEntries(founder.client);
    expect(entries.map((e) => e.id)).not.toContain(entry.id);
  });

  it("does not affect other entries for the same Food/Child pair", async () => {
    const { founder, child, food, texture, entry: first } = await seedHouseholdWithEntry(
      "Household Deleting One Of Several Entries",
    );
    const second = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "disliked",
      reasonTagIds: [texture.id],
      notes: "Second try",
    });

    await deleteLogEntry(founder.client, first.id);

    const entries = await listLogEntries(founder.client);
    expect(entries.map((e) => e.id)).not.toContain(first.id);
    expect(entries.map((e) => e.id)).toContain(second.id);
  });

  it("blocks a caregiver outside the household from deleting its entries", async () => {
    const { entry } = await seedHouseholdWithEntry("Household Protected From Delete By Outsider");
    const outsider = await signUpFixture("Outsider Household For Delete");

    await expect(deleteLogEntry(outsider.client, entry.id)).rejects.toThrow();

    // Confirm it truly wasn't deleted, not just that the caller got an error.
    const { data: stillThere } = await admin.from("log_entry").select().eq("id", entry.id).single();
    expect(stillThere?.id).toBe(entry.id);
  });
});
