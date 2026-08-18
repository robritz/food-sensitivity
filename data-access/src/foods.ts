import { getCurrentCaregiver } from "./auth.js";
import type { DataAccessClient } from "./client.js";
import type { Tables } from "./database.types.js";

export interface Food {
  id: string;
  householdId: string;
  categoryId: string;
  /** Specific brand/product name, e.g. "Oscar Mayer Classic" -- not just a
   * general category like "hot dog". */
  name: string;
  createdAt: string;
}

export interface AddFoodInput {
  categoryId: string;
  name: string;
}

function toFood(row: Tables<"food">): Food {
  return {
    id: row.id,
    householdId: row.household_id,
    categoryId: row.category_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

/** Adds a Food to the caller's own household -- the household is derived
 * from the caller's session, not taken as input, following the same pattern
 * as `addChild`. */
export async function addFood(client: DataAccessClient, input: AddFoodInput): Promise<Food> {
  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("No signed-in caregiver -- cannot add a food without a household.");
  }

  const { data, error } = await client
    .from("food")
    .insert({ household_id: identity.householdId, category_id: input.categoryId, name: input.name })
    .select()
    .single();
  if (error) throw error;
  return toFood(data);
}

/** Lists every food in the caller's household. Relies on RLS (rather than an
 * explicit household_id filter) to scope the result, the same pattern
 * `listChildren` uses. */
export async function listFoods(client: DataAccessClient): Promise<Food[]> {
  const { data, error } = await client.from("food").select().order("name");
  if (error) throw error;
  return data.map(toFood);
}

/** Searches the caller's household Foods by a substring of their
 * brand/product name, for the entry-creation typeahead -- lets a caregiver
 * reuse an existing Food instead of creating a duplicate. Relies on RLS to
 * scope results to the caller's household, the same pattern `listFoods`
 * uses. Capped at 10 results since it's meant for an in-progress typeahead,
 * not a full listing. */
export async function searchFoods(client: DataAccessClient, query: string): Promise<Food[]> {
  const { data, error } = await client
    .from("food")
    .select()
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(10);
  if (error) throw error;
  return data.map(toFood);
}
