import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { signUpAndCreateHousehold } from "../src/auth.js";
import type { CaregiverIdentity } from "../src/auth.js";
import type { DataAccessClient } from "../src/client.js";
import { createServiceRoleClient } from "../src/client.js";
import { loadSupabaseEnv } from "../src/env.js";
import { acceptHouseholdInvite, inviteCaregiverByEmail } from "../src/invites.js";

const admin = createServiceRoleClient();
const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];
const redirectTo = "http://127.0.0.1:5173/accept-invite";

function freshClient(): DataAccessClient {
  const { url, anonKey } = loadSupabaseEnv();
  return createClient(url, anonKey) as DataAccessClient;
}

function freshCredentials() {
  return { email: `${randomUUID()}@example.test`, password: randomUUID() };
}

async function signUpFixture(householdName: string): Promise<{ client: DataAccessClient; identity: CaregiverIdentity }> {
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

/** A confirmed caregiver-less auth user -- for tests exercising the caregiver
 * insert policy directly rather than through the founding/joining flows. */
async function signUpOutsider(): Promise<{ userId: string; client: DataAccessClient }> {
  const { email, password } = freshCredentials();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUserIds.push(data.user.id);

  const client = freshClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { userId: data.user.id, client };
}

/**
 * Sends a real invite (through the `invite-caregiver` Edge Function, which
 * requires a running local Supabase stack -- see `supabase start`) and signs
 * in as the invited user, simulating "clicked the link, chose a password"
 * without depending on the URL-hash mechanics that are the browser client's
 * job, not this module's.
 */
async function inviteAndSignIn(
  founderClient: DataAccessClient,
  inviteeEmail: string,
): Promise<DataAccessClient> {
  await inviteCaregiverByEmail(founderClient, { email: inviteeEmail, redirectTo });

  const { data: usersPage, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const invitedUser = usersPage.users.find((user) => user.email === inviteeEmail);
  if (!invitedUser) throw new Error(`Expected an auth user to exist for ${inviteeEmail} after inviting them.`);
  createdUserIds.push(invitedUser.id);

  // Following the real invite link both confirms the email and establishes a
  // session; replicate the "confirms the email" half here since sign-in
  // (unlike the link-click flow) requires it up front.
  const password = randomUUID();
  const { error: passwordError } = await admin.auth.admin.updateUserById(invitedUser.id, {
    password,
    email_confirm: true,
  });
  if (passwordError) throw passwordError;

  const inviteeClient = freshClient();
  const { error: signInError } = await inviteeClient.auth.signInWithPassword({ email: inviteeEmail, password });
  if (signInError) throw signInError;

  return inviteeClient;
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  for (const householdId of createdHouseholdIds) {
    await admin.from("household").delete().eq("id", householdId);
  }
});

describe("inviteCaregiverByEmail", () => {
  it("records an invite for the caller's household and creates the invited auth user", async () => {
    const founder = await signUpFixture("Inviting Household");
    const inviteeEmail = `${randomUUID()}@example.test`;

    await inviteCaregiverByEmail(founder.client, { email: inviteeEmail, redirectTo });

    const { data: invites } = await admin
      .from("household_invite")
      .select()
      .eq("household_id", founder.identity.householdId)
      .eq("email", inviteeEmail);
    expect(invites).toHaveLength(1);

    const { data: usersPage } = await admin.auth.admin.listUsers();
    const invitedUser = usersPage.users.find((user) => user.email === inviteeEmail);
    expect(invitedUser).toBeDefined();
    if (invitedUser) createdUserIds.push(invitedUser.id);
  });

  it("rejects invites from someone who isn't a caregiver of any household", async () => {
    const outsider = await signUpOutsider();

    await expect(
      inviteCaregiverByEmail(outsider.client, { email: `${randomUUID()}@example.test`, redirectTo }),
    ).rejects.toThrow();
  });
});

describe("acceptHouseholdInvite", () => {
  it("joins the invited caregiver to the inviting household, not a new one", async () => {
    const founder = await signUpFixture("Household With Invite");
    const inviteeEmail = `${randomUUID()}@example.test`;
    const inviteeClient = await inviteAndSignIn(founder.client, inviteeEmail);

    const identity = await acceptHouseholdInvite(inviteeClient, { displayName: "Invited Caregiver" });

    expect(identity.householdId).toBe(founder.identity.householdId);
    expect(identity.displayName).toBe("Invited Caregiver");

    const { data: caregivers } = await admin
      .from("caregiver")
      .select()
      .eq("household_id", founder.identity.householdId);
    expect(caregivers).toHaveLength(2);
  });

  it("lets the invited caregiver read/write household data, and keeps outsiders out", async () => {
    const founder = await signUpFixture("Household To Share");
    const inviteeEmail = `${randomUUID()}@example.test`;
    const inviteeClient = await inviteAndSignIn(founder.client, inviteeEmail);
    await acceptHouseholdInvite(inviteeClient, { displayName: "Invited Caregiver" });

    const { data: readByInvitee, error: readError } = await inviteeClient
      .from("household")
      .select()
      .eq("id", founder.identity.householdId)
      .single();
    expect(readError).toBeNull();
    expect(readByInvitee?.name).toBe(founder.identity.householdName);

    const { data: writtenByInvitee, error: writeError } = await inviteeClient
      .from("household")
      .update({ name: "Renamed by invitee" })
      .eq("id", founder.identity.householdId)
      .select();
    expect(writeError).toBeNull();
    expect(writtenByInvitee?.[0]?.name).toBe("Renamed by invitee");

    const outsider = await signUpFixture("Unrelated Household");

    const { data: readByOutsider } = await outsider.client
      .from("household")
      .select()
      .eq("id", founder.identity.householdId);
    expect(readByOutsider).toHaveLength(0);

    const { data: writtenByOutsider, error: outsiderWriteError } = await outsider.client
      .from("household")
      .update({ name: "hijacked" })
      .eq("id", founder.identity.householdId)
      .select();
    expect(outsiderWriteError).toBeNull();
    expect(writtenByOutsider).toHaveLength(0);
  });
});

describe("caregiver invite-join policy", () => {
  it("blocks a fresh user from joining a household with no invite addressed to them", async () => {
    const founder = await signUpFixture("Guarded Household");
    const outsider = await signUpOutsider();

    const { error } = await outsider.client
      .from("caregiver")
      .insert({ household_id: founder.identity.householdId, user_id: outsider.userId, display_name: "Outsider" });
    expect(error).not.toBeNull();
  });

  it("blocks joining using an invite addressed to a different email", async () => {
    const founder = await signUpFixture("Household With Someone Elses Invite");
    await inviteCaregiverByEmail(founder.client, { email: `${randomUUID()}@example.test`, redirectTo });
    const outsider = await signUpOutsider();

    const { error } = await outsider.client
      .from("caregiver")
      .insert({ household_id: founder.identity.householdId, user_id: outsider.userId, display_name: "Outsider" });
    expect(error).not.toBeNull();
  });
});
