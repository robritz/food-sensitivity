import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReverseGeocode, nameFromMapboxFeature } from "../src/mapboxClient.js";

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
