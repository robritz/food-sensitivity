import { describe, expect, it } from "vitest";
import { buildLocationPins } from "../src/mapPins.js";
import type { Location } from "../src/locations.js";
import type { LogEntry } from "../src/logEntries.js";

// Pure-logic tests for the map view's (ticket 14) location-grouping and
// pin-color rule -- no Supabase or network involved, same standalone
// treatment as mapboxClient.test.ts.

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "loc-1",
    householdId: "household-1",
    name: "Grandma's House",
    latitude: 40.7128,
    longitude: -74.006,
    mapboxPlaceId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: "entry-1",
    householdId: "household-1",
    foodId: "food-1",
    childId: "child-1",
    status: "liked",
    reasonTagIds: ["tag-1"],
    notes: null,
    intensity: null,
    occurredAt: "2026-01-01T00:00:00.000Z",
    locationId: "loc-1",
    createdBy: "caregiver-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildLocationPins", () => {
  it("returns one pin per Location with a matching entry, colored for its status", () => {
    const location = makeLocation();
    const entry = makeEntry({ status: "liked" });

    const pins = buildLocationPins([location], [entry]);

    expect(pins).toEqual([{ location, entries: [entry], color: "green" }]);
  });

  it("omits a Location with no entries logged there", () => {
    const withEntry = makeLocation({ id: "loc-1" });
    const withoutEntry = makeLocation({ id: "loc-2", name: "Empty Park" });
    const entry = makeEntry({ locationId: "loc-1" });

    const pins = buildLocationPins([withEntry, withoutEntry], [entry]);

    expect(pins.map((pin) => pin.location.id)).toEqual(["loc-1"]);
  });

  it("ignores entries with no locationId", () => {
    const location = makeLocation({ id: "loc-1" });
    const noLocationEntry = makeEntry({ locationId: null });

    const pins = buildLocationPins([location], [noLocationEntry]);

    expect(pins).toEqual([]);
  });

  it("pins only the located entries when most entries have no location (ticket 28)", () => {
    // Once location capture is opt-in, most entries are basic foods with no
    // place -- only the few located ones (e.g. a restaurant) become pins.
    const location = makeLocation({ id: "loc-1" });
    const located = makeEntry({ id: "entry-located", locationId: "loc-1" });
    const basicA = makeEntry({ id: "entry-a", locationId: null });
    const basicB = makeEntry({ id: "entry-b", locationId: null });

    const pins = buildLocationPins([location], [basicA, located, basicB]);

    expect(pins).toEqual([{ location, entries: [located], color: "green" }]);
  });

  it("colors a pin red if any entry logged there was disliked, even alongside liked entries", () => {
    const location = makeLocation({ id: "loc-1" });
    const liked = makeEntry({ id: "entry-1", locationId: "loc-1", status: "liked" });
    const disliked = makeEntry({ id: "entry-2", locationId: "loc-1", status: "disliked" });

    const pins = buildLocationPins([location], [liked, disliked]);

    expect(pins[0].color).toBe("red");
  });

  it("colors a pin yellow when entries are inconsistent but none disliked", () => {
    const location = makeLocation({ id: "loc-1" });
    const liked = makeEntry({ id: "entry-1", locationId: "loc-1", status: "liked" });
    const inconsistent = makeEntry({ id: "entry-2", locationId: "loc-1", status: "inconsistent" });

    const pins = buildLocationPins([location], [liked, inconsistent]);

    expect(pins[0].color).toBe("yellow");
  });

  it("groups multiple Locations' entries independently", () => {
    const locationA = makeLocation({ id: "loc-a" });
    const locationB = makeLocation({ id: "loc-b", name: "Park" });
    const likedAtA = makeEntry({ id: "entry-1", locationId: "loc-a", status: "liked" });
    const dislikedAtB = makeEntry({ id: "entry-2", locationId: "loc-b", status: "disliked" });

    const pins = buildLocationPins([locationA, locationB], [likedAtA, dislikedAtB]);

    const byId = new Map(pins.map((pin) => [pin.location.id, pin]));
    expect(byId.get("loc-a")?.color).toBe("green");
    expect(byId.get("loc-b")?.color).toBe("red");
  });
});
