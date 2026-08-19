import type { Location } from "./locations.js";
import type { LogEntry, LogEntryStatus } from "./logEntries.js";

export type PinColor = "green" | "yellow" | "red";

/**
 * A single map pin (ticket 14): the Location plus the entries logged there
 * and the color the pin should render in.
 */
export interface LocationPin {
  location: Location;
  entries: LogEntry[];
  color: PinColor;
}

const STATUS_COLOR: Record<LogEntryStatus, PinColor> = {
  disliked: "red",
  inconsistent: "yellow",
  liked: "green",
};

/**
 * Priority order for collapsing a Location's mix of entry statuses into one
 * pin color. Rather than "most common status" (which would bury a single
 * bad reaction at an otherwise-fine Location under a majority of good ones),
 * this always surfaces the most cautionary status present -- a caregiver
 * glancing at the map cares more about "has anything gone wrong here" than
 * "what's the average outcome". So: any disliked entry -> red, else any
 * inconsistent entry -> yellow, else (every entry liked) -> green.
 */
const STATUS_PRIORITY: LogEntryStatus[] = ["disliked", "inconsistent", "liked"];

function colorForStatuses(statuses: Iterable<LogEntryStatus>): PinColor {
  const present = new Set(statuses);
  const dominant = STATUS_PRIORITY.find((status) => present.has(status)) ?? "liked";
  return STATUS_COLOR[dominant];
}

/**
 * Groups entries by their Location and derives one pin per Location that
 * has at least one entry -- the map view's (ticket 14) "one pin per Location
 * the household has logged food at" rule. Locations with no entries (e.g.
 * captured but never logged against, though that shouldn't normally happen)
 * are omitted rather than rendered as an empty/gray pin.
 *
 * Pure and Supabase-free by design so the grouping/color rule above is
 * unit-testable without a network call, same treatment as `mapboxClient.ts`
 * gets relative to `locations.ts`.
 */
export function buildLocationPins(locations: Location[], entries: LogEntry[]): LocationPin[] {
  const entriesByLocationId = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    if (!entry.locationId) continue;
    const list = entriesByLocationId.get(entry.locationId);
    if (list) list.push(entry);
    else entriesByLocationId.set(entry.locationId, [entry]);
  }

  const pins: LocationPin[] = [];
  for (const location of locations) {
    const locationEntries = entriesByLocationId.get(location.id);
    if (!locationEntries || locationEntries.length === 0) continue;
    pins.push({
      location,
      entries: locationEntries,
      color: colorForStatuses(locationEntries.map((entry) => entry.status)),
    });
  }
  return pins;
}
