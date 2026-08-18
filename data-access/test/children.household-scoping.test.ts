import { describe, expect, it, afterAll } from "vitest";
import { addChild, listChildren } from "../src/children.js";
import { addCaregiverToHousehold, admin, signUpFixture } from "./helpers.js";

const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("addChild", () => {
  it("adds a child with a name and birthdate to the caller's household", async () => {
    const founder = await signUpFixture("Household With Kids", createdUserIds, createdHouseholdIds);

    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });

    expect(child.name).toBe("Alex");
    expect(child.birthdate).toBe("2019-04-12");
    expect(child.householdId).toBe(founder.identity.householdId);
  });
});

describe("listChildren", () => {
  it("lists every child in the caller's household", async () => {
    const founder = await signUpFixture("Household With Two Kids", createdUserIds, createdHouseholdIds);
    await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    await addChild(founder.client, { name: "Sam", birthdate: "2021-11-03" });

    const children = await listChildren(founder.client);

    expect(children.map((child) => child.name).sort()).toEqual(["Alex", "Sam"]);
  });

  it("scopes children to household -- another household's children aren't visible", async () => {
    const householdA = await signUpFixture("Household A", createdUserIds, createdHouseholdIds);
    const householdB = await signUpFixture("Household B", createdUserIds, createdHouseholdIds);
    await addChild(householdA.client, { name: "Only In A", birthdate: "2020-01-01" });

    const childrenSeenByB = await listChildren(householdB.client);

    expect(childrenSeenByB.map((child) => child.name)).not.toContain("Only In A");
  });

  it("is visible to a fellow caregiver in the same household", async () => {
    const founder = await signUpFixture("Household With Two Caregivers", createdUserIds, createdHouseholdIds);
    await addChild(founder.client, { name: "Shared Child", birthdate: "2022-06-15" });

    const secondCaregiverClient = await addCaregiverToHousehold(founder.identity.householdId, createdUserIds);
    const childrenSeenBySecondCaregiver = await listChildren(secondCaregiverClient);

    expect(childrenSeenBySecondCaregiver.map((child) => child.name)).toContain("Shared Child");
  });
});
