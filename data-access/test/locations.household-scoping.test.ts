import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import { addLogEntry } from "../src/logEntries.js";
import { findOrCreateLocation } from "../src/locations.js";
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

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("findOrCreateLocation", () => {
  it("creates a Location scoped to the caller's household", async () => {
    const founder = await signUpFixture("Household Capturing A Location");

    const location = await findOrCreateLocation(founder.client, {
      name: "Grandma's House",
      latitude: 40.7128,
      longitude: -74.006,
      mapboxPlaceId: "poi.grandmas-house",
    });

    expect(location.name).toBe("Grandma's House");
    expect(location.householdId).toBe(founder.identity.householdId);
    expect(location.mapboxPlaceId).toBe("poi.grandmas-house");
  });

  it("reuses the existing Location on a second capture with the same Mapbox place id", async () => {
    const founder = await signUpFixture("Household Reusing A Location");

    const first = await findOrCreateLocation(founder.client, {
      name: "Daycare",
      latitude: 41.0,
      longitude: -73.5,
      mapboxPlaceId: "poi.daycare",
    });
    const second = await findOrCreateLocation(founder.client, {
      // Even a differently-cased/typed suggested name for the same place
      // shouldn't spawn a duplicate row -- the place id is the reuse key.
      name: "Daycare Center",
      latitude: 41.0001,
      longitude: -73.5001,
      mapboxPlaceId: "poi.daycare",
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Daycare");

    const { data: rows, error } = await admin
      .from("location")
      .select()
      .eq("household_id", founder.identity.householdId)
      .eq("mapbox_place_id", "poi.daycare");
    if (error) throw error;
    expect(rows).toHaveLength(1);
  });

  it("creates distinct Locations for different Mapbox place ids", async () => {
    const founder = await signUpFixture("Household With Two Locations");

    const home = await findOrCreateLocation(founder.client, {
      name: "Home",
      latitude: 40.0,
      longitude: -75.0,
      mapboxPlaceId: "poi.home",
    });
    const park = await findOrCreateLocation(founder.client, {
      name: "Park",
      latitude: 40.1,
      longitude: -75.1,
      mapboxPlaceId: "poi.park",
    });

    expect(home.id).not.toBe(park.id);
  });

  it("does not dedupe custom Locations (no Mapbox match) -- each capture creates a new row", async () => {
    const founder = await signUpFixture("Household With Custom Locations");

    const first = await findOrCreateLocation(founder.client, {
      name: "Somewhere unnamed",
      latitude: 12.34,
      longitude: 56.78,
    });
    const second = await findOrCreateLocation(founder.client, {
      name: "Somewhere unnamed",
      latitude: 12.34,
      longitude: 56.78,
    });

    expect(second.id).not.toBe(first.id);
    expect(first.mapboxPlaceId).toBeNull();
    expect(second.mapboxPlaceId).toBeNull();
  });

  it("is visible to a fellow caregiver in the same household", async () => {
    const founder = await signUpFixture("Household Sharing A Location");
    const location = await findOrCreateLocation(founder.client, {
      name: "Shared Place",
      latitude: 1,
      longitude: 2,
      mapboxPlaceId: "poi.shared-place",
    });

    const secondCaregiverClient = await addCaregiverToHousehold(founder.identity.householdId, createdUserIds);
    const { data: seen, error } = await secondCaregiverClient.from("location").select().eq("id", location.id);
    if (error) throw error;
    expect(seen).toHaveLength(1);
  });

  it("scopes Locations to household -- another household's place id isn't reused and isn't visible", async () => {
    const householdA = await signUpFixture("Household A Location");
    const householdB = await signUpFixture("Household B Location");
    const locationA = await findOrCreateLocation(householdA.client, {
      name: "Only In A",
      latitude: 5,
      longitude: 6,
      mapboxPlaceId: "poi.only-in-a",
    });

    // Household B capturing the *same* Mapbox place id must not reuse A's
    // row -- the unique dedup key is (household_id, mapbox_place_id).
    const locationB = await findOrCreateLocation(householdB.client, {
      name: "Only In A",
      latitude: 5,
      longitude: 6,
      mapboxPlaceId: "poi.only-in-a",
    });
    expect(locationB.id).not.toBe(locationA.id);
    expect(locationB.householdId).toBe(householdB.identity.householdId);

    const { data: seenByB, error } = await householdB.client.from("location").select().eq("id", locationA.id);
    if (error) throw error;
    expect(seenByB).toHaveLength(0);
  });

  it("does not let a caller add a location directly to another household", async () => {
    const householdA = await signUpFixture("Household A Location Spoof");
    const householdB = await signUpFixture("Household B Location Spoof");

    const { error } = await householdA.client.from("location").insert({
      household_id: householdB.identity.householdId,
      name: "Spoofed Location",
      latitude: 0,
      longitude: 0,
    });

    expect(error).not.toBeNull();
  });
});

describe("addLogEntry with a location", () => {
  async function seedFood(client: DataAccessClient, name = "Oscar Mayer Classic") {
    const protein = await findCategory(client, "Protein");
    return addFood(client, { categoryId: protein.id, name });
  }

  it("stores the resolved Location on the entry", async () => {
    const founder = await signUpFixture("Household Logging With A Location");
    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    const food = await seedFood(founder.client);
    const texture = await findReasonTag(founder.client, "Texture");
    const location = await findOrCreateLocation(founder.client, {
      name: "Kitchen table",
      latitude: 10,
      longitude: 20,
      mapboxPlaceId: "poi.kitchen-table",
    });

    const entry = await addLogEntry(founder.client, {
      foodId: food.id,
      childId: child.id,
      status: "liked",
      reasonTagIds: [texture.id],
      locationId: location.id,
    });

    expect(entry.locationId).toBe(location.id);
  });

  it("blocks logging an entry against another household's location", async () => {
    const householdA = await signUpFixture("Household A Log With Location");
    const householdB = await signUpFixture("Household B Log With Location");
    const childB = await addChild(householdB.client, { name: "Child B", birthdate: "2020-01-01" });
    const foodB = await seedFood(householdB.client, "Food In B");
    const textureB = await findReasonTag(householdB.client, "Texture");
    const locationA = await findOrCreateLocation(householdA.client, {
      name: "Only In A",
      latitude: 1,
      longitude: 1,
      mapboxPlaceId: "poi.only-in-a-log",
    });

    await expect(
      addLogEntry(householdB.client, {
        foodId: foodB.id,
        childId: childB.id,
        status: "liked",
        reasonTagIds: [textureB.id],
        locationId: locationA.id,
      }),
    ).rejects.toThrow();
  });
});
