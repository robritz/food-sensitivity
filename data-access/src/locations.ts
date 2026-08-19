import { getCurrentCaregiver } from "./auth.js";
import type { DataAccessClient } from "./client.js";
import type { Tables } from "./database.types.js";
import { fetchReverseGeocode, type ReverseGeocodeMatch } from "./mapboxClient.js";

export interface Location {
  id: string;
  householdId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Null for a custom Location with no Mapbox match (manual entry, or the
   * reverse-geocode call failed/returned nothing). */
  mapboxPlaceId: string | null;
  createdAt: string;
}

export interface FindOrCreateLocationInput {
  /** Caller-supplied id, used as the row's primary key instead of the
   * column's `gen_random_uuid()` default. Optional -- omit for the normal
   * online path. The offline sync queue (ticket 11) passes the id it
   * generated at enqueue time here on every sync attempt: `mapboxPlaceId`
   * reuse (below) only dedupes a *Mapbox-matched* place, so a caregiver's
   * custom (no-match) Location has nothing else stable to key a retry off
   * of -- without this, a sync retry that resolves the location again but
   * fails before the log_entry it's attached to actually lands would create
   * a second, orphaned custom Location every attempt. */
  id?: string;
  /** Caregiver-confirmed or manually-entered name -- what actually gets
   * saved, independent of whatever Mapbox suggested. */
  name: string;
  latitude: number;
  longitude: number;
  /** Present when this capture matched a Mapbox place; omitted for a custom
   * (no-match or geocoding-unavailable) Location. Drives reuse: a second
   * capture with the same id resolves to the existing row instead of
   * inserting a duplicate. */
  mapboxPlaceId?: string | null;
}

function toLocation(row: Tables<"location">): Location {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    mapboxPlaceId: row.mapbox_place_id,
    createdAt: row.created_at,
  };
}

/** Lists every Location captured by the caller's household, for ticket 13's
 * location filter option list. Relies on RLS (rather than an explicit
 * household_id filter) to scope the result, the same pattern `listFoods`
 * uses. */
export async function listLocations(client: DataAccessClient): Promise<Location[]> {
  const { data, error } = await client.from("location").select().order("name");
  if (error) throw error;
  return data.map(toLocation);
}

/**
 * Reuses the caller's household's existing Location for a Mapbox place id if
 * one was already captured there, or creates a new one -- the ticket 10
 * "reuse by place ID" rule. Only Mapbox-matched captures (`mapboxPlaceId`
 * set) are deduped; a custom Location (no match) always creates a new row,
 * since without a place id there's nothing stable to key reuse on.
 *
 * This only touches Supabase -- no network call to Mapbox happens here, so
 * reuse works even if Mapbox is unreachable at read time (it was only needed
 * at initial capture, to produce the `mapboxPlaceId` in the first place).
 */
export async function findOrCreateLocation(
  client: DataAccessClient,
  input: FindOrCreateLocationInput,
): Promise<Location> {
  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("No signed-in caregiver -- cannot add a location without a household.");
  }

  if (input.mapboxPlaceId) {
    // RLS scopes this to the caller's own household, same as every other
    // select in data-access -- no explicit household_id filter needed.
    const { data: existing, error: findError } = await client
      .from("location")
      .select()
      .eq("mapbox_place_id", input.mapboxPlaceId)
      .maybeSingle();
    if (findError) throw findError;
    if (existing) return toLocation(existing);
  }

  const { data, error } = await client
    .from("location")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      household_id: identity.householdId,
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      mapbox_place_id: input.mapboxPlaceId ?? null,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      // 23505 = unique_violation, from one of two possible constraints:
      //  - the primary key (`id`), when `input.id` was supplied and a prior
      //    attempt already inserted this exact row -- a sync retry. Check
      //    this first: it's unambiguous (only our own retry could conflict
      //    on an id we generated) and covers *every* Location, unlike the
      //    mapbox_place_id constraint below, which only exists for
      //    Mapbox-matched places.
      //  - (household_id, mapbox_place_id), when another request for the
      //    same place id raced this one and won between our lookup above
      //    and this insert.
      // Either way, fall back to the row that's actually there instead of
      // surfacing a spurious duplicate-key error.
      if (input.id) {
        const { data: existingById, error: idFindError } = await client
          .from("location")
          .select()
          .eq("id", input.id)
          .maybeSingle();
        if (idFindError) throw idFindError;
        if (existingById) return toLocation(existingById);
      }
      if (input.mapboxPlaceId) {
        const { data: existingByPlaceId, error: placeIdFindError } = await client
          .from("location")
          .select()
          .eq("mapbox_place_id", input.mapboxPlaceId)
          .single();
        if (placeIdFindError) throw placeIdFindError;
        return toLocation(existingByPlaceId);
      }
    }
    throw error;
  }
  return toLocation(data);
}

/**
 * Reverse-geocodes a captured GPS coordinate into a suggested place name via
 * Mapbox, degrading to null (rather than throwing) on any failure -- a
 * missing/invalid token, no network, or Mapbox being down should never block
 * logging an entry, only fall back to manual place-name entry. The actual
 * HTTP call lives in `fetchReverseGeocode` (mapboxClient.ts), kept separate
 * so that isolated piece can be unit-tested without a network call.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  token: string,
): Promise<ReverseGeocodeMatch | null> {
  try {
    return await fetchReverseGeocode(latitude, longitude, token);
  } catch {
    return null;
  }
}
