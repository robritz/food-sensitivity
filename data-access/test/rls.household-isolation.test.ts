import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataAccessClient } from "../src/client.js";
import { createServiceRoleClient } from "../src/client.js";
import { loadSupabaseEnv } from "../src/env.js";

interface AuthedUser {
  userId: string;
  email: string;
  password: string;
  client: DataAccessClient;
}

interface HouseholdFixture extends AuthedUser {
  householdId: string;
}

const admin = createServiceRoleClient();
const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

async function signUpUser(): Promise<AuthedUser> {
  const email = `${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data: userResult, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) throw userError;
  createdUserIds.push(userResult.user.id);

  const { url, anonKey } = loadSupabaseEnv();
  const client = createClient(url, anonKey) as DataAccessClient;
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { userId: userResult.user.id, email, password, client };
}

/** Seeds a household with one caregiver already in it, inserted directly as
 * service-role -- for tests that need an already-occupied household without
 * exercising the insert policy itself. */
async function seedHousehold(name: string): Promise<HouseholdFixture> {
  const { data: household, error: householdError } = await admin
    .from("household")
    .insert({ name })
    .select()
    .single();
  if (householdError) throw householdError;
  createdHouseholdIds.push(household.id);

  const user = await signUpUser();
  const { error: caregiverError } = await admin
    .from("caregiver")
    .insert({ household_id: household.id, user_id: user.userId, display_name: name });
  if (caregiverError) throw caregiverError;

  return { householdId: household.id, ...user };
}

/** Asserts a select through `client` returns exactly `count` rows -- how RLS
 * silently scopes visibility (as opposed to raising an error). */
async function expectVisibleRowCount(
  client: DataAccessClient,
  table: "household" | "caregiver",
  column: string,
  value: string,
  count: number,
): Promise<void> {
  const { data, error } = await client.from(table).select().eq(column, value);
  expect(error).toBeNull();
  expect(data).toHaveLength(count);
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("household-scoped RLS", () => {
  let householdA: HouseholdFixture;
  let householdB: HouseholdFixture;

  beforeAll(async () => {
    householdA = await seedHousehold("Household A");
    householdB = await seedHousehold("Household B");
  });

  it("lets a caregiver read their own household", () =>
    expectVisibleRowCount(householdA.client, "household", "id", householdA.householdId, 1));

  it("hides other households from a caregiver's reads", () =>
    expectVisibleRowCount(householdA.client, "household", "id", householdB.householdId, 0));

  it("hides other households' caregivers", () =>
    expectVisibleRowCount(householdA.client, "caregiver", "household_id", householdB.householdId, 0));

  it("blocks writes to another household's row", async () => {
    const { data, error } = await householdA.client
      .from("household")
      .update({ name: "hijacked" })
      .eq("id", householdB.householdId)
      .select();

    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { data: unchanged } = await admin
      .from("household")
      .select()
      .eq("id", householdB.householdId)
      .single();
    expect(unchanged?.name).toBe("Household B");
  });

  it("lets a caregiver update their own household", async () => {
    const { data, error } = await householdA.client
      .from("household")
      .update({ name: "Household A (renamed)" })
      .eq("id", householdA.householdId)
      .select();

    expect(error).toBeNull();
    expect(data?.[0].name).toBe("Household A (renamed)");
  });
});

describe("caregiver insert policy", () => {
  it("lets a fresh user found a new household as its first caregiver", async () => {
    const founder = await signUpUser();

    // The founder can't see the household via RLS until their caregiver row
    // exists (chicken-and-egg), so the client generates the id up front
    // instead of relying on RETURNING from the insert.
    const householdId = randomUUID();
    createdHouseholdIds.push(householdId);
    const { error: householdError } = await founder.client
      .from("household")
      .insert({ id: householdId, name: "Founded household" });
    expect(householdError).toBeNull();

    const { error: caregiverError } = await founder.client
      .from("caregiver")
      .insert({ household_id: householdId, user_id: founder.userId, display_name: "Founder" });
    expect(caregiverError).toBeNull();

    // Now visible, proving the founder really did become a member.
    await expectVisibleRowCount(founder.client, "household", "id", householdId, 1);
  });

  it("blocks a fresh user from joining a household that already has a caregiver", async () => {
    const occupied = await seedHousehold("Already occupied");
    const outsider = await signUpUser();

    const { error: joinError } = await outsider.client
      .from("caregiver")
      .insert({ household_id: occupied.householdId, user_id: outsider.userId, display_name: "Outsider" });

    expect(joinError).not.toBeNull();
  });
});
