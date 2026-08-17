import { getCurrentCaregiver } from "./auth.js";
import type { DataAccessClient } from "./client.js";
import type { Tables } from "./database.types.js";

export interface Child {
  id: string;
  householdId: string;
  name: string;
  /** ISO date string, e.g. "2020-05-01" -- no time component. */
  birthdate: string;
  createdAt: string;
}

export interface AddChildInput {
  name: string;
  /** ISO date string, e.g. "2020-05-01". */
  birthdate: string;
}

function toChild(row: Tables<"child">): Child {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    birthdate: row.birthdate,
    createdAt: row.created_at,
  };
}

/** Adds a child to the caller's own household -- the household is derived
 * from the caller's session, not taken as input, so a caregiver can never
 * add a child to a household they don't belong to. */
export async function addChild(client: DataAccessClient, input: AddChildInput): Promise<Child> {
  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("No signed-in caregiver -- cannot add a child without a household.");
  }

  const { data, error } = await client
    .from("child")
    .insert({ household_id: identity.householdId, name: input.name, birthdate: input.birthdate })
    .select()
    .single();
  if (error) throw error;
  return toChild(data);
}

/** Lists every child in the caller's household. Relies on RLS (rather than
 * an explicit household_id filter) to scope the result -- the same pattern
 * `getCurrentCaregiver` uses for reading fellow caregivers. */
export async function listChildren(client: DataAccessClient): Promise<Child[]> {
  const { data, error } = await client.from("child").select().order("name");
  if (error) throw error;
  return data.map(toChild);
}
