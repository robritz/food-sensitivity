import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import {
  addLogEntry,
  addLogEntryPhoto,
  getLogEntryPhotoUrl,
  listLogEntries,
  listLogEntryPhotos,
  MAX_PHOTOS_PER_LOG_ENTRY,
} from "../src/logEntries.js";
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

/** Adds a food to `client`'s household using a predefined category, for
 * tests that only care about log entries. */
async function seedFood(client: DataAccessClient, name = "Oscar Mayer Classic") {
  const protein = await findCategory(client, "Protein");
  return addFood(client, { categoryId: protein.id, name });
}

/** Sets up a household with a child, food, and reason tag -- everything a
 * test needs before it can call `addLogEntry`. */
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

describe("addLogEntry intensity", () => {
  it("optionally sets a 1-5 intensity rating on an entry", async () => {
    const founder = await signUpFixture("Household Rating Intensity");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);

    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
      intensity: 4,
    });

    expect(entry.intensity).toBe(4);
  });

  it("leaves intensity null when not provided", async () => {
    const founder = await signUpFixture("Household Skipping Intensity");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);

    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    expect(entry.intensity).toBeNull();
  });

  it("rejects an intensity outside 1-5", async () => {
    const founder = await signUpFixture("Household Bad Intensity");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);

    await expect(
      addLogEntry(founder.client, {
        foodId: food.id,
        childId: child.id,
        status: "liked",
        reasonTagIds: [texture.id],
        intensity: 0,
      }),
    ).rejects.toThrow();

    await expect(
      addLogEntry(founder.client, {
        foodId: food.id,
        childId: child.id,
        status: "liked",
        reasonTagIds: [texture.id],
        intensity: 6,
      }),
    ).rejects.toThrow();
  });
});

describe("addLogEntry occurredAt (date happened)", () => {
  it("defaults to roughly now when not provided", async () => {
    const founder = await signUpFixture("Household Default Occurred At");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const before = Date.now();

    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    const occurredAtMs = new Date(entry.occurredAt).getTime();
    expect(occurredAtMs).toBeGreaterThanOrEqual(before - 1000);
    expect(occurredAtMs).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("is editable to a past date (backdating)", async () => {
    const founder = await signUpFixture("Household Backdating");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const pastDate = "2020-06-15T12:00:00.000Z";

    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
      occurredAt: pastDate,
    });

    expect(new Date(entry.occurredAt).toISOString()).toBe(pastDate);

    const entries = await listLogEntries(founder.client);
    const stored = entries.find((e) => e.id === entry.id);
    expect(new Date(stored?.occurredAt ?? "").toISOString()).toBe(pastDate);
  });
});

describe("inconsistent status notes", () => {
  it("allows an inconsistent entry without a note -- the note is prompted, not required", async () => {
    const founder = await signUpFixture("Household Inconsistent No Note");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);

    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "inconsistent",
      reasonTagIds: [texture.id],
    });

    expect(entry.status).toBe("inconsistent");
    expect(entry.notes).toBeNull();
  });
});

describe("log entry photos", () => {
  it("attaches a photo to an entry and lists it back", async () => {
    const founder = await signUpFixture("Household Attaching Photo");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    const photo = await addLogEntryPhoto(founder.client, entry.id, fakePhoto());

    const photos = await listLogEntryPhotos(founder.client, entry.id);
    expect(photos.map((p) => p.path)).toContain(photo.path);
  });

  it("produces a signed URL for viewing an attached photo", async () => {
    const founder = await signUpFixture("Household Photo Url");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });
    const photo = await addLogEntryPhoto(founder.client, entry.id, fakePhoto());

    const url = await getLogEntryPhotoUrl(founder.client, photo.path);

    expect(url).toContain(photo.path);
  });

  it("allows at most 4 photos per entry", async () => {
    const founder = await signUpFixture("Household Photo Limit");
    const { child, food, texture } = await seedEntryPrereqs(founder.client);
    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    for (let i = 0; i < MAX_PHOTOS_PER_LOG_ENTRY; i++) {
      await addLogEntryPhoto(founder.client, entry.id, fakePhoto(`photo-${i}.jpg`));
    }

    await expect(addLogEntryPhoto(founder.client, entry.id, fakePhoto("photo-one-too-many.jpg"))).rejects.toThrow();

    const photos = await listLogEntryPhotos(founder.client, entry.id);
    expect(photos).toHaveLength(MAX_PHOTOS_PER_LOG_ENTRY);
  });

  it("blocks uploading a photo under another household's prefix or a foreign log entry id", async () => {
    const householdA = await signUpFixture("Household A Photo Spoof");
    const householdB = await signUpFixture("Household B Photo Spoof");
    const { child, food, texture } = await seedEntryPrereqs(householdB.client);
    const entryB = await addLogEntry(householdB.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
    });

    // Household A trying to upload directly under B's household prefix,
    // pointed at B's real log entry.
    const spoofPath = `${householdB.identity.householdId}/${entryB.id}/spoofed.jpg`;
    const { error } = await householdA.client.storage
      .from("entry-photos")
      .upload(spoofPath, fakePhoto(), { contentType: "image/jpeg" });

    expect(error).not.toBeNull();
  });

  describe("photos are only retrievable by caregivers within the owning household", () => {
    it("does not let another household list an entry's photos", async () => {
      const householdA = await signUpFixture("Household A Photo Privacy");
      const householdB = await signUpFixture("Household B Photo Privacy");
      const { child, food, texture } = await seedEntryPrereqs(householdA.client);
      const entryA = await addLogEntry(householdA.client, {
        foodId: food.id,
        childId: child.id,
        status: "liked",
        reasonTagIds: [texture.id],
      });
      await addLogEntryPhoto(householdA.client, entryA.id, fakePhoto());

      // householdB has no caregiver row for household A, so it can't even
      // call listLogEntryPhotos(entryA.id) meaningfully through the
      // data-access helper (it'd list under B's own prefix) -- exercise the
      // underlying storage RLS directly instead, the same way
      // logEntries.core-log-entry.test.ts drops to a raw `.from()` call to
      // check a select policy.
      const { data } = await householdB.client.storage
        .from("entry-photos")
        .list(`${householdA.identity.householdId}/${entryA.id}`);

      expect(data ?? []).toHaveLength(0);
    });

    it("does not let another household download a photo even with the exact path", async () => {
      const householdA = await signUpFixture("Household A Photo Download Privacy");
      const householdB = await signUpFixture("Household B Photo Download Privacy");
      const { child, food, texture } = await seedEntryPrereqs(householdA.client);
      const entryA = await addLogEntry(householdA.client, {
        foodId: food.id,
        childId: child.id,
        status: "liked",
        reasonTagIds: [texture.id],
      });
      const photo = await addLogEntryPhoto(householdA.client, entryA.id, fakePhoto());

      const { error } = await householdB.client.storage.from("entry-photos").download(photo.path);

      expect(error).not.toBeNull();
    });

    it("does let a fellow caregiver in the same household retrieve the photo", async () => {
      const founder = await signUpFixture("Household Sharing Photo");
      const { child, food, texture } = await seedEntryPrereqs(founder.client);
      const entry = await addLogEntry(founder.client, {
        foodId: food.id,
        childId: child.id,
        status: "liked",
        reasonTagIds: [texture.id],
      });
      const photo = await addLogEntryPhoto(founder.client, entry.id, fakePhoto());

      const secondCaregiverClient = await addCaregiverToHousehold(founder.identity.householdId, createdUserIds);

      const { error } = await secondCaregiverClient.storage.from("entry-photos").download(photo.path);

      expect(error).toBeNull();
    });
  });
});
