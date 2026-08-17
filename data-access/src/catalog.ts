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
