/**
 * Mapbox's Search Box API (`search/searchbox/v1`) -- a different product
 * from the classic Geocoding API `mapboxClient.ts` uses. Ticket 22: the
 * classic API's `poi` type returns zero results for every query on this
 * account (verified live -- "starbucks", "mcdonalds", even "eiffel tower"
 * all came back empty), so business-name search has to go through this API
 * instead. It also matches plain addresses, so it fully replaces the
 * classic API's forward-geocoding role, not just POI search.
 *
 * Two-step by design: `suggest` returns lightweight matches (no
 * coordinates); `retrieve` resolves one chosen suggestion's `mapboxId` to
 * actual coordinates. Both calls in a suggest -> retrieve pair should share
 * the same caller-supplied `sessionToken` (Mapbox's session-billing unit).
 */

export interface PlaceSuggestion {
  /** Mapbox's permanent id for the place -- stable across sessions, safe to
   * store for `findOrCreateLocation`'s reuse-by-place-id dedup. */
  mapboxId: string;
  name: string;
  /** Full address/place string, for disambiguating same-named suggestions
   * (e.g. two nearby chain locations) in a picklist. */
  placeName?: string;
}

export interface PlaceSuggestOptions {
  /** Biases results toward this position. */
  proximity?: { latitude: number; longitude: number };
  /** Hard-restricts results to within this many miles of `proximity` (sent
   * as a `bbox` around it) -- unlike the classic Geocoding API, Search Box's
   * `bbox` is a genuine geo-filter, verified live: it returns real nearby
   * matches for common queries in a dense area, and correctly returns zero
   * for a query with no real match in a sparse one. Ignored if `proximity`
   * isn't set. */
  radiusMiles?: number;
  /** Restricts matches to these Mapbox feature types (comma-separated, e.g.
   * "poi,address"). Omit for an unrestricted search. */
  types?: string;
  /** Mapbox's own cap is 10. */
  limit?: number;
}

const MILES_PER_DEGREE_LATITUDE = 69;

/** Approximate lat/lng bounding box `radiusMiles` around `center`, for the
 * `bbox` param. Precision doesn't matter here -- this only needs to keep
 * "nearby" roughly nearby, not draw an exact circle. */
function boundingBox(
  center: { latitude: number; longitude: number },
  radiusMiles: number,
): [number, number, number, number] {
  const latDelta = radiusMiles / MILES_PER_DEGREE_LATITUDE;
  const milesPerDegreeLongitude = Math.max(
    MILES_PER_DEGREE_LATITUDE * Math.cos((center.latitude * Math.PI) / 180),
    1,
  );
  const lngDelta = radiusMiles / milesPerDegreeLongitude;
  return [
    center.longitude - lngDelta,
    center.latitude - latDelta,
    center.longitude + lngDelta,
    center.latitude + latDelta,
  ];
}

interface RawSuggestion {
  mapbox_id: string;
  name: string;
  full_address?: string;
  place_formatted?: string;
}

function suggestionFromRaw(raw: RawSuggestion): PlaceSuggestion {
  return { mapboxId: raw.mapbox_id, name: raw.name, placeName: raw.full_address ?? raw.place_formatted };
}

/**
 * Calls Search Box's `/suggest` endpoint directly -- isolated from
 * `searchPlaces` (locations.ts) so that function's fallback-on-failure
 * behavior can be tested without a live network call, same convention as
 * `fetchReverseGeocode`/`mapboxClient.ts`.
 *
 * Throws on any non-2xx response or network failure -- callers that want
 * graceful degradation (the UI does) should catch and fall back to an empty
 * picklist.
 */
export async function fetchPlaceSuggestions(
  query: string,
  token: string,
  sessionToken: string,
  options: PlaceSuggestOptions = {},
): Promise<PlaceSuggestion[]> {
  const url = new URL("https://api.mapbox.com/search/searchbox/v1/suggest");
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("session_token", sessionToken);
  if (options.limit) {
    url.searchParams.set("limit", String(options.limit));
  }
  if (options.proximity) {
    url.searchParams.set("proximity", `${options.proximity.longitude},${options.proximity.latitude}`);
    if (options.radiusMiles) {
      url.searchParams.set("bbox", boundingBox(options.proximity, options.radiusMiles).join(","));
    }
  }
  if (options.types) {
    url.searchParams.set("types", options.types);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mapbox Search Box suggest request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { suggestions?: RawSuggestion[] };
  return (body.suggestions ?? []).map(suggestionFromRaw);
}

export interface PlaceDetails extends PlaceSuggestion {
  latitude: number;
  longitude: number;
}

/**
 * Calls Search Box's `/retrieve` endpoint directly -- resolves one
 * suggestion (by the `mapboxId` `fetchPlaceSuggestions` returned) to actual
 * coordinates. Must reuse the same `sessionToken` passed to the `suggest`
 * call that produced this id.
 *
 * Throws on any non-2xx response or network failure, same convention as the
 * rest of this module.
 */
export async function fetchPlaceDetails(
  mapboxId: string,
  token: string,
  sessionToken: string,
): Promise<PlaceDetails | null> {
  const url = new URL(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("session_token", sessionToken);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mapbox Search Box retrieve request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    features?: { properties: RawSuggestion; geometry: { coordinates: [number, number] } }[];
  };
  const feature = body.features?.[0];
  if (!feature) return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  return { ...suggestionFromRaw(feature.properties), latitude, longitude };
}
