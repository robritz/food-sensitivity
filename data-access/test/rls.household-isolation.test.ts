import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataAccessClient } from "../src/client.js";
import { createServiceRoleClient } from "../src/client.js";
import { loadSupabaseEnv } from "../src/env.js";

interface HouseholdFixture {
  householdId: string;
  userId: string;
  email: string;
  password: string;
  client: DataAccessClient;
}

const admin = createServiceRoleClient();

async function seedHousehold(name: string): Promise<HouseholdFixture> {
  const { data: household, error: householdError } = await admin
    .from("household")
    .insert({ name })
    .select()
    .single();
  if (householdError) throw householdError;

  const email = `${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data: userResult, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) throw userError;
  const userId = userResult.user.id;

  const { error: caregiverError } = await admin
    .from("caregiver")
    .insert({ household_id: household.id, user_id: userId, display_name: name });
  if (caregiverError) throw caregiverError;

  const { url, anonKey } = loadSupabaseEnv();
  const client = createClient(url, anonKey) as DataAccessClient;
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { householdId: household.id, userId, email, password, client };
}

describe("household-scoped RLS", () => {
  let householdA: HouseholdFixture;
  let householdB: HouseholdFixture;

  beforeAll(async () => {
    householdA = await seedHousehold("Household A");
    householdB = await seedHousehold("Household B");
  });

  afterAll(async () => {
    for (const fixture of [householdA, householdB]) {
      await admin.auth.admin.deleteUser(fixture.userId);
      await admin.from("household").delete().eq("id", fixture.householdId);
    }
  });

  it("lets a caregiver read their own household", async () => {
    const { data, error } = await householdA.client
      .from("household")
      .select()
      .eq("id", householdA.householdId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].id).toBe(householdA.householdId);
  });

  it("hides other households from a caregiver's reads", async () => {
    const { data, error } = await householdA.client
      .from("household")
      .select()
      .eq("id", householdB.householdId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("hides other households' caregivers", async () => {
    const { data, error } = await householdA.client
      .from("caregiver")
      .select()
      .eq("household_id", householdB.householdId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

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
