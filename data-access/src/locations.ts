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
      household_id: identity.householdId,
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      mapbox_place_id: input.mapboxPlaceId ?? null,
    })
    .select()
    .single();
  if (error) {
    // 23505 = unique_violation on (household_id, mapbox_place_id): another
    // request for the same place id raced this one and won between our
    // lookup above and this insert. Fall back to the row it just created
    // instead of surfacing a spurious duplicate-key error.
    if (error.code === "23505" && input.mapboxPlaceId) {
      const { data: existing, error: raceFindError } = await client
        .from("location")
        .select()
        .eq("mapbox_place_id", input.mapboxPlaceId)
        .single();
      if (raceFindError) throw raceFindError;
      return toLocation(existing);
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
