import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchForwardGeocode, fetchReverseGeocode, nameFromMapboxFeature } from "../src/mapboxClient.js";

// Pure-logic/fetch-mocked tests for the isolated Mapbox HTTP call -- no
// Supabase or live network involved, unlike the rest of data-access/test
// (which needs a local Supabase instance). Safe to run standalone.

describe("nameFromMapboxFeature", () => {
  it("prefers the short `text` name over the full `place_name`", () => {
    const match = nameFromMapboxFeature({
      id: "poi.123",
      text: "Grandma's House",
      place_name: "Grandma's House, 123 Main St, Springfield",
    });
    expect(match).toEqual({ mapboxPlaceId: "poi.123", name: "Grandma's House" });
  });

  it("falls back to `place_name` when `text` is missing", () => {
    const match = nameFromMapboxFeature({ id: "poi.456", place_name: "123 Main St, Springfield" });
    expect(match).toEqual({ mapboxPlaceId: "poi.456", name: "123 Main St, Springfield" });
  });

  it("returns null when neither name field is usable", () => {
    expect(nameFromMapboxFeature({ id: "poi.789", text: "  ", place_name: "" })).toBeNull();
  });
});

describe("fetchReverseGeocode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the first feature's match on a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ id: "poi.abc", text: "Local Park" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchReverseGeocode(40, -70, "test-token");

    expect(result).toEqual({ mapboxPlaceId: "poi.abc", name: "Local Park" });
    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.toString()).toContain("/-70,40.json");
    expect(requestedUrl.searchParams.get("access_token")).toBe("test-token");
  });

  it("returns null when Mapbox has no match for the coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }),
    );

    const result = await fetchReverseGeocode(0, 0, "test-token");

    expect(result).toBeNull();
  });

  it("throws on a non-2xx response, leaving fallback behavior to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }),
    );

    await expect(fetchReverseGeocode(0, 0, "bad-token")).rejects.toThrow();
  });
});

describe("fetchForwardGeocode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns every feature as a named match, defaulting to limit=1 and no proximity bias", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ id: "poi.abc", text: "123 Main St", center: [-70.1, 40.2] }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchForwardGeocode("123 Main St, Springfield", "test-token");

    expect(result).toEqual([{ mapboxPlaceId: "poi.abc", name: "123 Main St", latitude: 40.2, longitude: -70.1 }]);
    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.toString()).toContain(
      `/${encodeURIComponent("123 Main St, Springfield")}.json`,
    );
    expect(requestedUrl.searchParams.get("access_token")).toBe("test-token");
    expect(requestedUrl.searchParams.get("limit")).toBe("1");
    expect(requestedUrl.searchParams.has("proximity")).toBe(false);
  });

  it("requests the given limit and biases toward the given proximity (as longitude,latitude)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchForwardGeocode("Main St", "test-token", {
      limit: 5,
      proximity: { latitude: 40.2, longitude: -70.1 },
    });

    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.searchParams.get("limit")).toBe("5");
    expect(requestedUrl.searchParams.get("proximity")).toBe("-70.1,40.2");
  });

  it("restricts to the given types when provided, and omits the param otherwise", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchForwardGeocode("Main St", "test-token", { types: "poi,address" });

    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.searchParams.get("types")).toBe("poi,address");

    await fetchForwardGeocode("Main St", "test-token");
    const requestedUrlWithoutTypes = fetchMock.mock.calls[1][0] as URL;
    expect(requestedUrlWithoutTypes.searchParams.has("types")).toBe(false);
  });

  it("includes the full place_name as placeName when Mapbox returns one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              id: "poi.abc",
              text: "Subway",
              place_name: "Subway, 123 Main St, Springfield",
              center: [-70.1, 40.2],
            },
          ],
        }),
      }),
    );

    const result = await fetchForwardGeocode("Subway", "test-token");

    expect(result).toEqual([
      {
        mapboxPlaceId: "poi.abc",
        name: "Subway",
        placeName: "Subway, 123 Main St, Springfield",
        latitude: 40.2,
        longitude: -70.1,
      },
    ]);
  });

  it("returns multiple matches in the order Mapbox returns them, skipping features with no coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            { id: "poi.a", text: "A Place", center: [-70.1, 40.2] },
            { id: "poi.no-center", text: "No Coords" },
            { id: "poi.b", text: "B Place", center: [-70.2, 40.3] },
          ],
        }),
      }),
    );

    const result = await fetchForwardGeocode("Main St", "test-token", { limit: 5 });

    expect(result).toEqual([
      { mapboxPlaceId: "poi.a", name: "A Place", latitude: 40.2, longitude: -70.1 },
      { mapboxPlaceId: "poi.b", name: "B Place", latitude: 40.3, longitude: -70.2 },
    ]);
  });

  it("returns an empty array when Mapbox has no match for the query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }),
    );

    const result = await fetchForwardGeocode("nonsense query", "test-token");

    expect(result).toEqual([]);
  });

  it("throws on a non-2xx response, leaving fallback behavior to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }),
    );

    await expect(fetchForwardGeocode("123 Main St", "bad-token")).rejects.toThrow();
  });
});
