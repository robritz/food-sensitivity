import { afterAll, describe, expect, it } from "vitest";
import { addCategory, addReasonTag, listCategories, listReasonTags } from "../src/catalog.js";
import { addCaregiverToHousehold, admin, signUpFixture as signUpHouseholdFixture } from "./helpers.js";

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

describe("addCategory", () => {
  it("adds a custom category scoped to the caller's household", async () => {
    const founder = await signUpFixture("Household With Custom Category");

    const category = await addCategory(founder.client, "Leftovers");

    expect(category.name).toBe("Leftovers");
    expect(category.householdId).toBe(founder.identity.householdId);
  });

  it("is visible to a fellow caregiver in the same household", async () => {
    const founder = await signUpFixture("Household Sharing Custom Category");
    await addCategory(founder.client, "Fermented");

    const secondCaregiverClient = await addCaregiverToHousehold(founder.identity.householdId, createdUserIds);
    const categoriesSeenBySecondCaregiver = await listCategories(secondCaregiverClient);

    expect(categoriesSeenBySecondCaregiver.map((c) => c.name)).toContain("Fermented");
  });

  it("scopes custom categories to household -- another household's custom category isn't visible", async () => {
    const householdA = await signUpFixture("Household A Custom Category");
    const householdB = await signUpFixture("Household B Custom Category");
    await addCategory(householdA.client, "Only In A Category");

    const categoriesSeenByB = await listCategories(householdB.client);

    expect(categoriesSeenByB.map((c) => c.name)).not.toContain("Only In A Category");
  });

  it("does not let a caller add a category directly to another household", async () => {
    const householdA = await signUpFixture("Household A Category Spoof");
    const householdB = await signUpFixture("Household B Category Spoof");

    const { error } = await householdA.client
      .from("category")
      .insert({ household_id: householdB.identity.householdId, name: "Spoofed Category" });

    expect(error).not.toBeNull();
  });
});

describe("addReasonTag", () => {
  it("adds a custom reason tag scoped to the caller's household", async () => {
    const founder = await signUpFixture("Household With Custom Reason Tag");

    const reasonTag = await addReasonTag(founder.client, "Color");

    expect(reasonTag.name).toBe("Color");
    expect(reasonTag.householdId).toBe(founder.identity.householdId);
  });

  it("is visible to a fellow caregiver in the same household", async () => {
    const founder = await signUpFixture("Household Sharing Custom Reason Tag");
    await addReasonTag(founder.client, "Portion size");

    const secondCaregiverClient = await addCaregiverToHousehold(founder.identity.householdId, createdUserIds);
    const reasonTagsSeenBySecondCaregiver = await listReasonTags(secondCaregiverClient);

    expect(reasonTagsSeenBySecondCaregiver.map((t) => t.name)).toContain("Portion size");
  });

  it("scopes custom reason tags to household -- another household's custom tag isn't visible", async () => {
    const householdA = await signUpFixture("Household A Custom Reason Tag");
    const householdB = await signUpFixture("Household B Custom Reason Tag");
    await addReasonTag(householdA.client, "Only In A Tag");

    const reasonTagsSeenByB = await listReasonTags(householdB.client);

    expect(reasonTagsSeenByB.map((t) => t.name)).not.toContain("Only In A Tag");
  });

  it("does not let a caller add a reason tag directly to another household", async () => {
    const householdA = await signUpFixture("Household A Reason Tag Spoof");
    const householdB = await signUpFixture("Household B Reason Tag Spoof");

    const { error } = await householdA.client
      .from("reason_tag")
      .insert({ household_id: householdB.identity.householdId, name: "Spoofed Tag" });

    expect(error).not.toBeNull();
  });
});
