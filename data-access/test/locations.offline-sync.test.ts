import { afterAll, describe, expect, it } from "vitest";
import { findOrCreateLocation } from "../src/locations.js";
import { admin, signUpFixture as signUpHouseholdFixture } from "./helpers.js";

const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

function signUpFixture(householdName: string) {
  return signUpHouseholdFixture(householdName, createdUserIds, createdHouseholdIds);
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("findOrCreateLocation idempotency (client-supplied id)", () => {
  it("uses a caller-supplied id as the row's id instead of generating one", async () => {
    const founder = await signUpFixture("Household Client Id Location");
    const clientId = crypto.randomUUID();

    const location = await findOrCreateLocation(founder.client, {
      id: clientId,
      name: "Backyard",
      latitude: 40.1,
      longitude: -73.1,
    });

    expect(location.id).toBe(clientId);
  });

  it("retrying with the same id for a *custom* (no mapboxPlaceId) location does not create a duplicate row -- the sync-retry case a mapbox-matched place id can't cover", async () => {
    const founder = await signUpFixture("Household Retried Custom Location");
    const clientId = crypto.randomUUID();
    const input = {
      id: clientId,
      name: "Grandma's Backyard",
      latitude: 40.2,
      longitude: -73.2,
    };

    const first = await findOrCreateLocation(founder.client, input);
    const second = await findOrCreateLocation(founder.client, input);

    expect(second.id).toBe(first.id);

    const { data, error } = await founder.client.from("location").select("id").eq("id", clientId);
    if (error) throw error;
    expect(data).toHaveLength(1);
  });
});
