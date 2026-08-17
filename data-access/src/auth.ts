import type { DataAccessClient } from "./client.js";

export interface SignUpAndCreateHouseholdInput {
  email: string;
  password: string;
  displayName: string;
  householdName: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface CaregiverIdentity {
  caregiverId: string;
  userId: string;
  displayName: string;
  householdId: string;
  householdName: string;
}

/**
 * Signs up a brand-new caregiver and founds a household for them in one
 * step -- the vertical slice ticket 03 asks for ("sign up" produces both a
 * Caregiver and a Household, with the caregiver as its first member).
 *
 * The household id is generated here rather than read back from the insert
 * because RLS won't let the caller see the household row until their
 * caregiver row exists to link them to it (see the "founds a new household"
 * policy in the 02 migration).
 */
export async function signUpAndCreateHousehold(
  client: DataAccessClient,
  input: SignUpAndCreateHouseholdInput,
): Promise<CaregiverIdentity> {
  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email: input.email,
    password: input.password,
  });
  if (signUpError) throw signUpError;

  const userId = signUpData.user?.id;
  if (!userId || !signUpData.session) {
    throw new Error(
      "Sign-up did not return an active session -- email confirmation is required before the household can be created.",
    );
  }

  const householdId = crypto.randomUUID();
  const { error: householdError } = await client
    .from("household")
    .insert({ id: householdId, name: input.householdName });
  if (householdError) throw householdError;

  // No `.select()` here: Postgres re-checks the SELECT policy for a
  // RETURNING clause, and `current_household_id()` reads this same
  // statement's snapshot, which can't yet see the row it's part of
  // inserting -- it would reject its own insert. Fetching the identity as a
  // separate follow-up request (below) sidesteps that self-reference.
  const { error: caregiverError } = await client
    .from("caregiver")
    .insert({ household_id: householdId, user_id: userId, display_name: input.displayName });
  if (caregiverError) throw caregiverError;

  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("Caregiver row was inserted but is not readable back -- this should be unreachable.");
  }
  return identity;
}

/** Logs a returning caregiver in and returns their caregiver + household identity. */
export async function signInWithPassword(
  client: DataAccessClient,
  input: SignInInput,
): Promise<CaregiverIdentity> {
  const { error } = await client.auth.signInWithPassword(input);
  if (error) throw error;

  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("Signed in, but no caregiver row was found for this account.");
  }
  return identity;
}

export async function signOut(client: DataAccessClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/** The signed-in caller's user id, or null if no one is signed in.
 *
 * getSession() reads the locally held session and, unlike getUser(),
 * resolves to null rather than throwing when no one is signed in. */
export async function getSessionUserId(client: DataAccessClient): Promise<string | null> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  return sessionData.session?.user.id ?? null;
}

/** The signed-in caller's caregiver + household identity, or null if no one is signed in. */
export async function getCurrentCaregiver(client: DataAccessClient): Promise<CaregiverIdentity | null> {
  const userId = await getSessionUserId(client);
  if (!userId) return null;

  const { data: caregiver, error: caregiverError } = await client
    .from("caregiver")
    .select("id, display_name, household_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (caregiverError) throw caregiverError;
  if (!caregiver) return null;

  const { data: household, error: householdError } = await client
    .from("household")
    .select("name")
    .eq("id", caregiver.household_id)
    .single();
  if (householdError) throw householdError;

  return {
    caregiverId: caregiver.id,
    userId,
    displayName: caregiver.display_name,
    householdId: caregiver.household_id,
    householdName: household.name,
  };
}
