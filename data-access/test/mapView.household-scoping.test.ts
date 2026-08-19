import { afterAll, describe, expect, it } from "vitest";
import { addChild } from "../src/children.js";
import { listCategories, listReasonTags } from "../src/catalog.js";
import { addFood } from "../src/foods.js";
import { addLogEntry, listLogEntries } from "../src/logEntries.js";
import { findOrCreateLocation, listLocations } from "../src/locations.js";
import { buildLocationPins } from "../src/mapPins.js";
import type { DataAccessClient } from "../src/client.js";
import type { Category, ReasonTag } from "../src/catalog.js";
import { admin, signUpFixture as signUpHouseholdFixture } from "./helpers.js";

// Integration test (ticket 14): the map view's query -- listLocations plus
// listLogEntries, fed into buildLocationPins -- must be scoped to the
// caller's household the same as every other data-access read, both at the
// query level (RLS) and after buildLocationPins groups the results.

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

async function seedLoggedLocation(
  client: DataAccessClient,
  label: string,
  place: { name: string; latitude: number; longitude: number; mapboxPlaceId: string },
) {
  const child = await addChild(client, { name: `Child ${label}`, birthdate: "2019-04-12" });
  const protein = await findCategory(client, "Protein");
  const food = await addFood(client, { categoryId: protein.id, name: `Food ${label}` });
  const texture = await findReasonTag(client, "Texture");
  const location = await findOrCreateLocation(client, place);
  const entry = await addLogEntry(client, {
    foodId: food.id,
    childId: child.id,
    status: "liked",
    reasonTagIds: [texture.id],
    locationId: location.id,
  });
  return { location, entry };
}

describe("map view data is scoped to household", () => {
  it("listLocations only returns the caller's own household's Locations", async () => {
    const householdA = await signUpFixture("Household A Map View");
    const householdB = await signUpFixture("Household B Map View");

    const { location: locationA } = await seedLoggedLocation(householdA.client, "A", {
      name: "A's Kitchen",
      latitude: 10,
      longitude: 20,
      mapboxPlaceId: "poi.map-view-a",
    });
    const { location: locationB } = await seedLoggedLocation(householdB.client, "B", {
      name: "B's Kitchen",
      latitude: 30,
      longitude: 40,
      mapboxPlaceId: "poi.map-view-b",
    });

    const locationsSeenByA = await listLocations(householdA.client);
    const idsSeenByA = locationsSeenByA.map((location) => location.id);

    expect(idsSeenByA).toContain(locationA.id);
    expect(idsSeenByA).not.toContain(locationB.id);
  });

  it("produces map pins containing only the caller's household's Locations and entries", async () => {
    const householdA = await signUpFixture("Household A Map Pins");
    const householdB = await signUpFixture("Household B Map Pins");

    const { location: locationA, entry: entryA } = await seedLoggedLocation(householdA.client, "A2", {
      name: "A's Park",
      latitude: 11,
      longitude: 21,
      mapboxPlaceId: "poi.map-pins-a",
    });
    await seedLoggedLocation(householdB.client, "B2", {
      name: "B's Park",
      latitude: 31,
      longitude: 41,
      mapboxPlaceId: "poi.map-pins-b",
    });

    const [locations, entries] = await Promise.all([
      listLocations(householdA.client),
      listLogEntries(householdA.client),
    ]);
    const pins = buildLocationPins(locations, entries);

    expect(pins).toHaveLength(1);
    expect(pins[0].location.id).toBe(locationA.id);
    expect(pins[0].entries.map((e) => e.id)).toEqual([entryA.id]);
  });
});
