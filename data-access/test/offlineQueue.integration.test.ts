import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import { listLogEntries, listLogEntryPhotos } from "../src/logEntries.js";
import { syncQueuedEntries, type QueuedLogEntry } from "../src/offlineQueue.js";
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
  return { child, food, texture };
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

describe("syncQueuedEntries", () => {
  it("simulates offline queue -> reconnect -> sync: a queued entry (with a photo and a location) lands on the server exactly once, even across repeated sync attempts", async () => {
    // "Offline": build up everything a caregiver would have entered while
    // disconnected, entirely client-side -- no addLogEntry/addLogEntryPhoto/
    // findOrCreateLocation call happens until syncQueuedEntries runs.
    const founder = await signUpFixture("Household Offline Queue Sync");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const queued: QueuedLogEntry = {
      clientId: crypto.randomUUID(),
      input: {
        foodId: food.id,
        childId: child.id,
        status: "liked",
        reasonTagIds: [texture.id],
        notes: "Logged offline at the park",
      },
      location: {
        name: "Riverside Park",
        latitude: 40.789,
        longitude: -73.955,
        mapboxPlaceId: null,
      },
      photos: [{ id: crypto.randomUUID(), name: "reaction.jpg", blob: fakePhoto() }],
    };

    // "Reconnect": first sync attempt.
    const firstRun = await syncQueuedEntries(founder.client, [queued]);
    expect(firstRun).toHaveLength(1);
    expect(firstRun[0].status).toBe("synced");

    // A second sync attempt over the *same still-queued* item -- simulates a
    // caller that (not knowing the first attempt actually landed, e.g. its
    // response was lost) retries, or a naive "sync on every reconnect"
    // implementation that hasn't dequeued yet. Must not create a duplicate.
    const secondRun = await syncQueuedEntries(founder.client, [queued]);
    expect(secondRun).toHaveLength(1);
    expect(secondRun[0].status).toBe("synced");
    if (firstRun[0].status === "synced" && secondRun[0].status === "synced") {
      expect(secondRun[0].entry.id).toBe(firstRun[0].entry.id);
    }

    const entries = await listLogEntries(founder.client);
    const matches = entries.filter((e) => e.id === queued.clientId);
    expect(matches).toHaveLength(1);
    expect(matches[0].notes).toBe("Logged offline at the park");
    expect(matches[0].locationId).not.toBeNull();

    const photos = await listLogEntryPhotos(founder.client, queued.clientId);
    expect(photos).toHaveLength(1);
  });

  it("keeps failed items reported as failed without throwing, so the caller can leave them queued for the next reconnect", async () => {
    const founder = await signUpFixture("Household Sync Failure");
    const { child, texture } = await seedEntryPrereqs(founder.client);
    const badQueued: QueuedLogEntry = {
      clientId: crypto.randomUUID(),
      input: {
        foodId: "00000000-0000-0000-0000-000000000000", // doesn't exist -- RLS/FK rejects it
        childId: child.id,
        status: "liked",
        reasonTagIds: [texture.id],
      },
      photos: [],
    };

    const outcomes = await syncQueuedEntries(founder.client, [badQueued]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].status).toBe("failed");
  });

  it("syncs multiple queued entries independently -- one failure doesn't block the rest", async () => {
    const founder = await signUpFixture("Household Mixed Sync Batch");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const good: QueuedLogEntry = {
      clientId: crypto.randomUUID(),
      input: { foodId: food.id, childId: child.id, status: "disliked", reasonTagIds: [texture.id] },
      photos: [],
    };
    const bad: QueuedLogEntry = {
      clientId: crypto.randomUUID(),
      input: {
        foodId: "00000000-0000-0000-0000-000000000000",
        childId: child.id,
        status: "liked",
        reasonTagIds: [texture.id],
      },
      photos: [],
    };

    const outcomes = await syncQueuedEntries(founder.client, [good, bad]);

    const goodOutcome = outcomes.find((o) => o.clientId === good.clientId);
    const badOutcome = outcomes.find((o) => o.clientId === bad.clientId);
    expect(goodOutcome?.status).toBe("synced");
    expect(badOutcome?.status).toBe("failed");
  });
});
