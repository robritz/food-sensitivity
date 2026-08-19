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
  if (filters.childIds?.length && !filters.childIds.includes(entry.childId)) return false;
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
 * OR within a type's selected values -- see `ActiveFilters`) and, if
 * `searchText` is non-empty, whose Food name/brand contains it
 * case-insensitively. Search and filters combine as AND: both must pass.
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
  return entries.filter((candidate) => {
    if (!matchesFilters(candidate, filters)) return false;
    if (normalizedSearch && !candidate.food.name.toLowerCase().includes(normalizedSearch)) return false;
    return true;
  });
}
