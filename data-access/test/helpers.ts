import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { signUpAndCreateHousehold } from "../src/auth.js";
import type { CaregiverIdentity } from "../src/auth.js";
import type { DataAccessClient } from "../src/client.js";
import { createServiceRoleClient } from "../src/client.js";
import { loadSupabaseEnv } from "../src/env.js";

/** Shared fixtures for integration tests that need real signed-in users
 * against a real local Supabase instance. Each test file still owns its own
 * `createdUserIds`/`createdHouseholdIds` cleanup arrays -- fixtures here just
 * append to whichever arrays are passed in. */
export const admin = createServiceRoleClient();

export function freshClient(): DataAccessClient {
  const { url, anonKey } = loadSupabaseEnv();
  return createClient(url, anonKey) as DataAccessClient;
}

export function freshCredentials(): { email: string; password: string } {
  return { email: `${randomUUID()}@example.test`, password: randomUUID() };
}

/** Signs up a brand-new caregiver who founds their own household. */
export async function signUpFixture(
  householdName: string,
  createdUserIds: string[],
  createdHouseholdIds: string[],
): Promise<{ client: DataAccessClient; identity: CaregiverIdentity }> {
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
  return { client, identity };
}

/** A confirmed, caregiver-less auth user -- for tests exercising an insert
 * policy directly rather than through the founding/joining flows. */
export async function signUpOutsider(createdUserIds: string[]): Promise<{ userId: string; client: DataAccessClient }> {
  const { email, password } = freshCredentials();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUserIds.push(data.user.id);

  const client = freshClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { userId: data.user.id, client };
}
