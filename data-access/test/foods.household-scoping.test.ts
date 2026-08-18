import { afterAll, describe, expect, it } from "vitest";
import { listCategories } from "../src/catalog.js";
import { addFood, listFoods, searchFoods } from "../src/foods.js";
import type { DataAccessClient } from "../src/client.js";
import { admin, signUpFixture as signUpHouseholdFixture } from "./helpers.js";

const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

function signUpFixture(householdName: string) {
  return signUpHouseholdFixture(householdName, createdUserIds, createdHouseholdIds);
}

async function proteinCategoryId(client: DataAccessClient): Promise<string> {
  const categories = await listCategories(client);
  const protein = categories.find((c) => c.name === "Protein");
  if (!protein) throw new Error('Expected a seeded category named "Protein".');
  return protein.id;
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("listFoods", () => {
  it("lists every food in the caller's household", async () => {
    const founder = await signUpFixture("Household With Foods");
    const categoryId = await proteinCategoryId(founder.client);
    await addFood(founder.client, { categoryId, name: "Oscar Mayer Classic" });
    await addFood(founder.client, { categoryId, name: "Ballpark Angus" });

    const foods = await listFoods(founder.client);

    expect(foods.map((f) => f.name).sort()).toEqual(["Ballpark Angus", "Oscar Mayer Classic"]);
  });

  it("scopes foods to household -- another household's foods aren't visible", async () => {
    const householdA = await signUpFixture("Household A Foods");
    const householdB = await signUpFixture("Household B Foods");
    const categoryId = await proteinCategoryId(householdA.client);
    await addFood(householdA.client, { categoryId, name: "Only In A" });

    const foodsSeenByB = await listFoods(householdB.client);

    expect(foodsSeenByB.map((f) => f.name)).not.toContain("Only In A");
  });
});

describe("searchFoods", () => {
  it("matches foods by a substring of their brand/product name", async () => {
    const founder = await signUpFixture("Household Searching Foods");
    const categoryId = await proteinCategoryId(founder.client);
    await addFood(founder.client, { categoryId, name: "Oscar Mayer Classic" });
    await addFood(founder.client, { categoryId, name: "Ballpark Angus" });

    const results = await searchFoods(founder.client, "mayer");

    expect(results.map((f) => f.name)).toEqual(["Oscar Mayer Classic"]);
  });

  it("scopes search results to the caller's household -- another household's matching foods aren't visible", async () => {
    const householdA = await signUpFixture("Household A Search");
    const householdB = await signUpFixture("Household B Search");
    const categoryId = await proteinCategoryId(householdA.client);
    await addFood(householdA.client, { categoryId, name: "Only In A Nuggets" });

    const resultsForB = await searchFoods(householdB.client, "nuggets");

    expect(resultsForB).toEqual([]);
  });
});
