import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlaceDetails, fetchPlaceSuggestions } from "../src/mapboxSearchClient.js";

// Pure-logic/fetch-mocked tests for the isolated Mapbox Search Box HTTP
// calls -- no Supabase or live network involved, unlike the rest of
// data-access/test (which needs a local Supabase instance). Safe to run
// standalone.

describe("fetchPlaceSuggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps suggestions to mapboxId/name/placeName, preferring full_address over place_formatted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            mapbox_id: "abc123",
            name: "Starbucks",
            full_address: "38 Park Row, New York, NY 10038",
            place_formatted: "New York, NY 10038",
          },
          { mapbox_id: "def456", name: "Local Cafe", place_formatted: "New York, NY 10038" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPlaceSuggestions("starbucks", "test-token", "session-1");

    expect(result).toEqual([
      { mapboxId: "abc123", name: "Starbucks", placeName: "38 Park Row, New York, NY 10038" },
      { mapboxId: "def456", name: "Local Cafe", placeName: "New York, NY 10038" },
    ]);
    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.pathname).toBe("/search/searchbox/v1/suggest");
    expect(requestedUrl.searchParams.get("q")).toBe("starbucks");
    expect(requestedUrl.searchParams.get("access_token")).toBe("test-token");
    expect(requestedUrl.searchParams.get("session_token")).toBe("session-1");
  });

  it("sends limit, types, proximity, and a bbox derived from radiusMiles", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPlaceSuggestions("starbucks", "test-token", "session-1", {
      proximity: { latitude: 40, longitude: -70 },
      radiusMiles: 5,
      types: "poi,address",
      limit: 5,
    });

    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.searchParams.get("limit")).toBe("5");
    expect(requestedUrl.searchParams.get("types")).toBe("poi,address");
    expect(requestedUrl.searchParams.get("proximity")).toBe("-70,40");
    const bbox = requestedUrl.searchParams.get("bbox")?.split(",").map(Number);
    expect(bbox).toHaveLength(4);
    const [minLng, minLat, maxLng, maxLat] = bbox as [number, number, number, number];
    expect(minLng).toBeLessThan(-70);
    expect(maxLng).toBeGreaterThan(-70);
    expect(minLat).toBeLessThan(40);
    expect(maxLat).toBeGreaterThan(40);
  });

  it("omits bbox when radiusMiles is given without proximity", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPlaceSuggestions("starbucks", "test-token", "session-1", { radiusMiles: 5 });

    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.searchParams.has("bbox")).toBe(false);
    expect(requestedUrl.searchParams.has("proximity")).toBe(false);
  });

  it("returns an empty array when Mapbox has no suggestions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const result = await fetchPlaceSuggestions("nonsense query", "test-token", "session-1");

    expect(result).toEqual([]);
  });

  it("throws on a non-2xx response, leaving fallback behavior to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }),
    );

    await expect(fetchPlaceSuggestions("starbucks", "bad-token", "session-1")).rejects.toThrow();
  });
});

describe("fetchPlaceDetails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the first feature's coordinates and properties", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: { mapbox_id: "abc123", name: "Starbucks", full_address: "38 Park Row, New York, NY" },
            geometry: { coordinates: [-74.0065, 40.7117] },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPlaceDetails("abc123", "test-token", "session-1");

    expect(result).toEqual({
      mapboxId: "abc123",
      name: "Starbucks",
      placeName: "38 Park Row, New York, NY",
      latitude: 40.7117,
      longitude: -74.0065,
    });
    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.pathname).toBe("/search/searchbox/v1/retrieve/abc123");
    expect(requestedUrl.searchParams.get("access_token")).toBe("test-token");
    expect(requestedUrl.searchParams.get("session_token")).toBe("session-1");
  });

  it("returns null when Mapbox has no matching feature", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }));

    const result = await fetchPlaceDetails("nonexistent", "test-token", "session-1");

    expect(result).toBeNull();
  });

  it("throws on a non-2xx response, leaving fallback behavior to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }),
    );

    await expect(fetchPlaceDetails("abc123", "bad-token", "session-1")).rejects.toThrow();
  });
});
