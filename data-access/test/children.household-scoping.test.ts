import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { signUpAndCreateHousehold } from "../src/auth.js";
import type { CaregiverIdentity } from "../src/auth.js";
import { addChild, listChildren } from "../src/children.js";
import type { DataAccessClient } from "../src/client.js";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../src/client.js";
import { loadSupabaseEnv } from "../src/env.js";

const admin = createServiceRoleClient();
const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

function freshClient(): DataAccessClient {
  const { url, anonKey } = loadSupabaseEnv();
  return createClient(url, anonKey) as DataAccessClient;
}

async function signUpFixture(householdName: string): Promise<{ client: DataAccessClient; identity: CaregiverIdentity }> {
  const client = freshClient();
  const identity = await signUpAndCreateHousehold(client, {
    email: `${randomUUID()}@example.test`,
    password: randomUUID(),
    displayName: `Caregiver for ${householdName}`,
    householdName,
  });
  createdUserIds.push(identity.userId);
  createdHouseholdIds.push(identity.householdId);
  return { client, identity };
}

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
    const founder = await signUpFixture("Household With Kids");

    const child = await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });

    expect(child.name).toBe("Alex");
    expect(child.birthdate).toBe("2019-04-12");
    expect(child.householdId).toBe(founder.identity.householdId);
  });
});

describe("listChildren", () => {
  it("lists every child in the caller's household", async () => {
    const founder = await signUpFixture("Household With Two Kids");
    await addChild(founder.client, { name: "Alex", birthdate: "2019-04-12" });
    await addChild(founder.client, { name: "Sam", birthdate: "2021-11-03" });

    const children = await listChildren(founder.client);

    expect(children.map((child) => child.name).sort()).toEqual(["Alex", "Sam"]);
  });

  it("scopes children to household -- another household's children aren't visible", async () => {
    const householdA = await signUpFixture("Household A");
    const householdB = await signUpFixture("Household B");
    await addChild(householdA.client, { name: "Only In A", birthdate: "2020-01-01" });

    const childrenSeenByB = await listChildren(householdB.client);

    expect(childrenSeenByB.map((child) => child.name)).not.toContain("Only In A");
  });
});
