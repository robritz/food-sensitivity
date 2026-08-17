import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  getCurrentCaregiver,
  signInWithPassword,
  signOut,
  signUpAndCreateHousehold,
} from "../src/auth.js";
import type { DataAccessClient } from "../src/client.js";
import { createServiceRoleClient } from "../src/client.js";
import { loadSupabaseEnv } from "../src/env.js";

const admin = createServiceRoleClient();
const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

function freshClient(): DataAccessClient {
  const { url, anonKey } = loadSupabaseEnv();
  return createClient(url, anonKey) as DataAccessClient;
}

function freshCredentials() {
  return { email: `${randomUUID()}@example.test`, password: randomUUID() };
}

async function signUpFixture(householdName: string) {
  const client = freshClient();
  const { email, password } = freshCredentials();
  const identity = await signUpAndCreateHousehold(client, {
    email,
    password,
    displayName: `Caregiver for ${householdName}`,
    householdName,
  });
  createdUserIds.push(identity.userId);
  createdHouseholdIds.push(identity.householdId);
  return { client, email, password, identity };
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("signUpAndCreateHousehold", () => {
  it("creates a caregiver and a household, with the caregiver as its first member", async () => {
    const { identity } = await signUpFixture("The Testers");

    expect(identity.householdName).toBe("The Testers");
    expect(identity.displayName).toBe("Caregiver for The Testers");

    const { data: household } = await admin
      .from("household")
      .select()
      .eq("id", identity.householdId)
      .single();
    expect(household?.name).toBe("The Testers");

    const { data: caregivers } = await admin
      .from("caregiver")
      .select()
      .eq("household_id", identity.householdId);
    expect(caregivers).toHaveLength(1);
    expect(caregivers?.[0].user_id).toBe(identity.userId);
  });

  it("makes the new caregiver's identity readable via getCurrentCaregiver on the same session", async () => {
    const { client, identity } = await signUpFixture("Session Household");

    const current = await getCurrentCaregiver(client);
    expect(current).toEqual(identity);
  });
});

describe("signInWithPassword / signOut", () => {
  it("lets a returning caregiver log back in and reach their household", async () => {
    const { email, password, identity } = await signUpFixture("Returning Household");

    const returningClient = freshClient();
    const signedInIdentity = await signInWithPassword(returningClient, { email, password });
    expect(signedInIdentity).toEqual(identity);

    const current = await getCurrentCaregiver(returningClient);
    expect(current).toEqual(identity);
  });

  it("returns null from getCurrentCaregiver once signed out", async () => {
    const { client } = await signUpFixture("Sign Out Household");

    await signOut(client);

    const current = await getCurrentCaregiver(client);
    expect(current).toBeNull();
  });

  it("returns null from getCurrentCaregiver when no one has ever signed in", async () => {
    const current = await getCurrentCaregiver(freshClient());
    expect(current).toBeNull();
  });
});

describe("cross-household isolation via the signup flow", () => {
  it("keeps each caregiver's household data invisible to the other", async () => {
    const householdA = await signUpFixture("Isolation Household A");
    const householdB = await signUpFixture("Isolation Household B");

    const currentForA = await getCurrentCaregiver(householdA.client);
    expect(currentForA?.householdId).toBe(householdA.identity.householdId);

    const { data: crossHouseholdRead } = await householdA.client
      .from("household")
      .select()
      .eq("id", householdB.identity.householdId);
    expect(crossHouseholdRead).toHaveLength(0);

    const { data: crossCaregiverRead } = await householdA.client
      .from("caregiver")
      .select()
      .eq("household_id", householdB.identity.householdId);
    expect(crossCaregiverRead).toHaveLength(0);
  });
});
