import { getCurrentCaregiver } from "./auth.js";
import type { DataAccessClient } from "./client.js";
import type { Tables } from "./database.types.js";

export interface Category {
  id: string;
  /** Null for the predefined, system-seeded set; set for a household's own
   * custom addition (ticket 08). */
  householdId: string | null;
  name: string;
}

export interface ReasonTag {
  id: string;
  /** Null for the predefined, system-seeded set; set for a household's own
   * custom addition (ticket 08). */
  householdId: string | null;
  name: string;
}

function toCategory(row: Tables<"category">): Category {
  return { id: row.id, householdId: row.household_id, name: row.name };
}

function toReasonTag(row: Tables<"reason_tag">): ReasonTag {
  return { id: row.id, householdId: row.household_id, name: row.name };
}

/** Lists every category visible to the caller: the predefined set plus their
 * own household's custom additions. Relies on RLS to scope the result. */
export async function listCategories(client: DataAccessClient): Promise<Category[]> {
  const { data, error } = await client.from("category").select().order("name");
  if (error) throw error;
  return data.map(toCategory);
}

/** Lists every reason tag visible to the caller: the predefined set plus
 * their own household's custom additions. Relies on RLS to scope the
 * result. */
export async function listReasonTags(client: DataAccessClient): Promise<ReasonTag[]> {
  const { data, error } = await client.from("reason_tag").select().order("name");
  if (error) throw error;
  return data.map(toReasonTag);
}

/** Adds a custom category to the caller's own household -- the household is
 * derived from the caller's session, following the same pattern as
 * `addFood`. Visible to the whole household afterward via `listCategories`,
 * same as any other household-scoped row. */
export async function addCategory(client: DataAccessClient, name: string): Promise<Category> {
  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("No signed-in caregiver -- cannot add a category without a household.");
  }

  const { data, error } = await client
    .from("category")
    .insert({ household_id: identity.householdId, name })
    .select()
    .single();
  if (error) throw error;
  return toCategory(data);
}

/** Adds a custom reason tag to the caller's own household -- the household
 * is derived from the caller's session, following the same pattern as
 * `addFood`. Visible to the whole household afterward via `listReasonTags`,
 * same as any other household-scoped row. */
export async function addReasonTag(client: DataAccessClient, name: string): Promise<ReasonTag> {
  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("No signed-in caregiver -- cannot add a reason tag without a household.");
  }

  const { data, error } = await client
    .from("reason_tag")
    .insert({ household_id: identity.householdId, name })
    .select()
    .single();
  if (error) throw error;
  return toReasonTag(data);
}
