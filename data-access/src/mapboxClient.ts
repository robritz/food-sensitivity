export interface ReverseGeocodeMatch {
  /** Mapbox's own id for the matched feature (e.g. "poi.123456") -- the key
   * `findOrCreateLocation` dedupes on, not anything we generate ourselves. */
  mapboxPlaceId: string;
  /** Best available human-readable name for the match, suggested as a
   * starting point the caregiver can edit before saving. */
  name: string;
}

/**
 * Picks the best-named field off a raw Mapbox geocoding feature. Split out
 * from `fetchReverseGeocode` so the "how do we turn one API response feature
 * into a suggested name" decision can be unit-tested without a network call.
 *
 * Prefers `text` (the place's own name, e.g. "Grandma's House") over
 * `place_name` (the full "Grandma's House, 123 Main St, Springfield" string)
 * -- a shorter, more editable starting point for the caregiver.
 */
export function nameFromMapboxFeature(feature: { id: string; text?: string; place_name?: string }): ReverseGeocodeMatch | null {
  const name = feature.text?.trim() || feature.place_name?.trim();
  if (!name) return null;
  return { mapboxPlaceId: feature.id, name };
}

/**
 * Calls Mapbox's reverse geocoding endpoint directly -- isolated from
 * `reverseGeocode` (in locations.ts) so that function's fallback-on-failure
 * behavior, and `findOrCreateLocation`'s reuse-by-place-id logic, can be
 * tested without a live network call (mirrors how `client.ts` isolates
 * Supabase client construction from the rest of data-access).
 *
 * Throws on any non-2xx response or network failure -- callers that want
 * graceful degradation (the UI does) should catch and fall back to manual
 * entry, same as `reverseGeocode` does.
 */
export async function fetchReverseGeocode(
  latitude: number,
  longitude: number,
  token: string,
): Promise<ReverseGeocodeMatch | null> {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mapbox reverse geocoding request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { features?: { id: string; text?: string; place_name?: string }[] };
  const feature = body.features?.[0];
  if (!feature) return null;
  return nameFromMapboxFeature(feature);
}

export interface ForwardGeocodeMatch extends ReverseGeocodeMatch {
  latitude: number;
  longitude: number;
  /** Full "Grandma's House, 123 Main St, Springfield" string, for
   * disambiguating between same-named matches (e.g. two nearby chain
   * locations) in a picklist. Undefined if Mapbox didn't return one. */
  placeName?: string;
}

export interface ForwardGeocodeOptions {
  /** Biases -- but does not restrict -- results toward this position, so a
   * nearby match ranks first among otherwise-similar text matches. Omit for
   * an unbiased search. */
  proximity?: { latitude: number; longitude: number };
  /** Mapbox's own cap is 10. Defaults to 1 (a single best match) for callers
   * that only want ticket 20's forward-geocode-in-the-background behavior;
   * pass a higher limit for a caregiver-facing picklist (ticket 21). */
  limit?: number;
  /** Restricts matches to these Mapbox feature types (comma-separated, e.g.
   * "poi,address"). Omit for an unrestricted search. */
  types?: string;
}

/**
 * Calls Mapbox's forward geocoding endpoint directly (text -> places) -- the
 * counterpart to `fetchReverseGeocode`, isolated the same way so
 * `forwardGeocode` (locations.ts)'s fallback-on-failure behavior can be
 * tested without a live network call. Reuses `nameFromMapboxFeature` for each
 * returned feature, so a match carries the same `mapboxPlaceId`/`name` shape
 * `fetchReverseGeocode` produces, plural.
 *
 * Throws on any non-2xx response or network failure -- callers that want
 * graceful degradation (the UI does) should catch and fall back to leaving
 * coordinates unset, same as `reverseGeocode` does.
 */
export async function fetchForwardGeocode(
  query: string,
  token: string,
  options: ForwardGeocodeOptions = {},
): Promise<ForwardGeocodeMatch[]> {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", String(options.limit ?? 1));
  if (options.proximity) {
    url.searchParams.set("proximity", `${options.proximity.longitude},${options.proximity.latitude}`);
  }
  if (options.types) {
    url.searchParams.set("types", options.types);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mapbox forward geocoding request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    features?: { id: string; text?: string; place_name?: string; center?: [number, number] }[];
  };
  return (body.features ?? []).flatMap((feature) => {
    if (!feature.center) return [];
    const match = nameFromMapboxFeature(feature);
    if (!match) return [];
    const [longitude, latitude] = feature.center;
    return [{ ...match, latitude, longitude, placeName: feature.place_name?.trim() || undefined }];
  });
}
