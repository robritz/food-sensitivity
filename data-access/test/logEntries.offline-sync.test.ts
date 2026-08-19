import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import { addLogEntry, addLogEntryPhoto, listLogEntries, listLogEntryPhotos } from "../src/logEntries.js";
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

async function seedFood(client: DataAccessClient, name = "Oscar Mayer Classic") {
  const protein = await findCategory(client, "Protein");
  return addFood(client, { categoryId: protein.id, name });
}

async function seedEntryPrereqs(client: DataAccessClient) {
  const child = await addChild(client, { name: "Alex", birthdate: "2019-04-12" });
  const food = await seedFood(client);
  const texture = await findReasonTag(client, "Texture");
  const taste = await findReasonTag(client, "Taste");
  return { child, food, texture, taste };
}

function fakePhoto(name = "photo.jpg"): File {
  return new File([Buffer.from("fake image bytes")], name, { type: "image/jpeg" });
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("addLogEntry idempotency (client-supplied id)", () => {
  it("uses a caller-supplied id as the row's id instead of generating one", async () => {
    const founder = await signUpFixture("Household Client Id Entry");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const clientId = crypto.randomUUID();

    const entry = await addLogEntry(founder.client, {
      id: clientId,
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    expect(entry.id).toBe(clientId);
  });

  it("retrying addLogEntry with the same id does not create a duplicate row", async () => {
    const founder = await signUpFixture("Household Retried Entry");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const clientId = crypto.randomUUID();
    const input = {
      id: clientId,
      foodId: food.id,
      childId: child.id,
      status: "liked" as const,
      reasonTagIds: [texture.id],
      notes: "First attempt",
    };

    const first = await addLogEntry(founder.client, input);
    const second = await addLogEntry(founder.client, input);

    expect(second.id).toBe(first.id);
    expect(second.notes).toBe("First attempt");

    const entries = await listLogEntries(founder.client);
    const matches = entries.filter((e) => e.id === clientId);
    expect(matches).toHaveLength(1);
  });

  it("a retry that includes a reason tag missed by a failed first attempt still attaches it", async () => {
    // Simulates: first sync attempt inserted the log_entry row but died
    // before its reason-tag insert landed. Retrying the whole thing (same
    // id, same tags) must still end up with the tags attached, not silently
    // stuck tag-less forever.
    const founder = await signUpFixture("Household Partial Retry Entry");
    const { child, food, texture, taste } = await seedEntryPrereqs(founder.client);
    const clientId = crypto.randomUUID();

    await founder.client.from("log_entry").insert({
      id: clientId,
      household_id: founder.identity.householdId,
      food_id: food.id,
      child_id: child.id,
      status: "liked",
      created_by: founder.identity.caregiverId,
      occurred_at: new Date().toISOString(),
    });

    const retried = await addLogEntry(founder.client, {
      id: clientId,
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id, taste.id],
    });

    expect(retried.reasonTagIds.sort()).toEqual([taste.id, texture.id].sort());
  });
});

describe("addLogEntryPhoto idempotency (client-supplied photoId)", () => {
  it("retrying an upload with the same photoId overwrites rather than duplicating", async () => {
    const founder = await signUpFixture("Household Retried Photo");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });
    const photoId = crypto.randomUUID();

    const first = await addLogEntryPhoto(founder.client, entry.id, fakePhoto(), { photoId });
    const second = await addLogEntryPhoto(founder.client, entry.id, fakePhoto(), { photoId });

    expect(second.path).toBe(first.path);
    const photos = await listLogEntryPhotos(founder.client, entry.id);
    expect(photos).toHaveLength(1);
  });
});
