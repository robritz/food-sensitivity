import type { Food } from "./foods.js";
import type { LogEntry, LogEntryStatus } from "./logEntries.js";

/**
 * A LogEntry paired with the Food it's for. Category and name live on Food,
 * not LogEntry, so `filterLogEntries` needs both joined together -- callers
 * (e.g. `listFoodStatusSummary`) build this pairing from whatever separate
 * `log_entry`/`food` data they already fetched.
 */
export interface LogEntryWithFood {
  entry: LogEntry;
  food: Pick<Food, "id" | "name" | "categoryId">;
}

/**
 * The food list's active filter selection (ticket 13). Every field is a list
 * of ids (or a date bound) rather than a single value, since a caregiver can
 * select multiple values within one filter type -- an entry matches a type
 * if it matches *any* selected value there (OR), and must match *every*
 * active type to pass overall (AND). An omitted/empty field means that
 * filter type isn't active and never excludes an entry.
 *
 * `childIds` is the one exception to OR-within-a-type: selecting several
 * children means *overlap* (ticket 24), not union -- an entry survives only
 * if it belongs to a selected child *and* is for a food that **every**
 * selected child has logged. A single child is unaffected (its own entries).
 * This can't live in the per-entry `matchesFilters` below (a LogEntry only
 * ever has one child, so "common to all children" only makes sense once
 * entries are aggregated by food) -- see `filterByChildOverlap`.
 */
export interface ActiveFilters {
  statuses?: LogEntryStatus[];
  categoryIds?: string[];
  reasonTagIds?: string[];
  childIds?: string[];
  locationIds?: string[];
  /** Inclusive lower bound on `occurredAt` (ISO timestamp/date string). */
  occurredFrom?: string;
  /** Inclusive upper bound on `occurredAt` (ISO timestamp/date string). */
  occurredTo?: string;
}

function matchesFilters({ entry, food }: LogEntryWithFood, filters: ActiveFilters): boolean {
  if (filters.statuses?.length && !filters.statuses.includes(entry.status)) return false;
  if (filters.categoryIds?.length && !filters.categoryIds.includes(food.categoryId)) return false;
  const { reasonTagIds } = filters;
  if (reasonTagIds?.length && !entry.reasonTagIds.some((id) => reasonTagIds.includes(id))) {
    return false;
  }
  // childIds is handled separately (overlap/AND, ticket 24) -- see filterByChildOverlap.
  // An entry with no captured location (ticket 10: geolocation denied, or
  // predates that ticket) can never match an active location filter -- there's
  // nothing to compare against, so it's excluded rather than treated as a wildcard.
  if (filters.locationIds?.length && (!entry.locationId || !filters.locationIds.includes(entry.locationId))) {
    return false;
  }
  if (filters.occurredFrom && entry.occurredAt < filters.occurredFrom) return false;
  if (filters.occurredTo && entry.occurredAt > filters.occurredTo) return false;
  return true;
}

/**
 * Returns the entries matching every active filter type (AND across types;
 * OR within a type's selected values, except `childIds` which is overlap/AND
 * -- see `ActiveFilters`) and, if `searchText` is non-empty, whose Food
 * name/brand contains it case-insensitively. Search and filters combine as
 * AND: both must pass.
 *
 * A pure, DB-free seam so the OR-within-type/AND-across-types combination
 * logic (and search) can be unit-tested directly, independent of how the
 * caller fetched/joined the underlying `log_entry`/`food` rows.
 */
export function filterLogEntries(
  entries: LogEntryWithFood[],
  filters: ActiveFilters,
  searchText = "",
): LogEntryWithFood[] {
  const normalizedSearch = searchText.trim().toLowerCase();
  const perEntry = entries.filter((candidate) => {
    if (!matchesFilters(candidate, filters)) return false;
    if (normalizedSearch && !candidate.food.name.toLowerCase().includes(normalizedSearch)) return false;
    return true;
  });
  // Child selection is overlap/AND (ticket 24), applied *after* the per-entry
  // filters so the overlap is computed over the already-narrowed set (e.g.
  // "foods every selected child has *liked*" when a status filter is active).
  if (!filters.childIds?.length) return perEntry;
  const kept = new Set(filterByChildOverlap(perEntry.map((c) => c.entry), filters.childIds).map((e) => e.id));
  return perEntry.filter((candidate) => kept.has(candidate.entry.id));
}

/**
 * The set of foodIds that *every* childId in `childIds` has logged at least
 * one of `pairs` for -- the intersection of each selected child's food set
 * (ticket 24's "overlap between people"). A single child yields exactly the
 * foods that child logged; an empty selection, or any selected child who has
 * logged nothing, yields an empty set.
 */
export function foodIdsCommonToChildren(
  pairs: readonly { foodId: string; childId: string }[],
  childIds: readonly string[],
): Set<string> {
  if (childIds.length === 0) return new Set();
  const foodsByChild = new Map<string, Set<string>>(childIds.map((childId) => [childId, new Set<string>()]));
  for (const { foodId, childId } of pairs) {
    foodsByChild.get(childId)?.add(foodId);
  }
  const [first, ...rest] = childIds.map((childId) => foodsByChild.get(childId) ?? new Set<string>());
  const overlap = new Set(first);
  for (const foodId of overlap) {
    if (!rest.every((set) => set.has(foodId))) overlap.delete(foodId);
  }
  return overlap;
}

/**
 * Narrows `items` to those satisfying ticket 24's multi-person overlap: an
 * item is kept only if it belongs to a selected child *and* is for a food
 * every selected child has logged. An empty `childIds` is a no-op (returns a
 * copy of `items` unchanged). Generic over anything carrying `foodId`/`childId`
 * so both the browse list (via `filterLogEntries`, on `LogEntry`) and the map
 * (on `LogEntry` before `buildLocationPins`) share one implementation.
 */
export function filterByChildOverlap<T extends { foodId: string; childId: string }>(
  items: readonly T[],
  childIds: readonly string[],
): T[] {
  if (childIds.length === 0) return [...items];
  const selected = items.filter((item) => childIds.includes(item.childId));
  const overlap = foodIdsCommonToChildren(selected, childIds);
  return selected.filter((item) => overlap.has(item.foodId));
}
