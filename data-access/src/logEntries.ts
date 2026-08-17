import { getCurrentCaregiver } from "./auth.js";
import type { DataAccessClient } from "./client.js";
import type { Tables } from "./database.types.js";

export type LogEntryStatus = "liked" | "disliked" | "inconsistent";

export interface LogEntry {
  id: string;
  householdId: string;
  foodId: string;
  childId: string;
  status: LogEntryStatus;
  reasonTagIds: string[];
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AddLogEntryInput {
  foodId: string;
  childId: string;
  status: LogEntryStatus;
  /** At least one is required -- an entry must say *why*, not just what. */
  reasonTagIds: string[];
  notes?: string;
}

// Takes reasonTagIds separately (unlike sibling toX(row) mappers) because
// they live in the log_entry_reason_tag join table, not on the row itself.
function toLogEntry(row: Tables<"log_entry">, reasonTagIds: string[]): LogEntry {
  return {
    id: row.id,
    householdId: row.household_id,
    foodId: row.food_id,
    childId: row.child_id,
    status: row.status as LogEntryStatus,
    reasonTagIds,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * Creates a LogEntry for a specific child/food pair. Entries are append-only
 * history -- logging the same Food/Child pair again always creates a new row
 * rather than touching any prior entry, so opinion over time is preserved.
 */
export async function addLogEntry(client: DataAccessClient, input: AddLogEntryInput): Promise<LogEntry> {
  if (input.reasonTagIds.length === 0) {
    throw new Error("An entry needs at least one reason tag.");
  }

  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("No signed-in caregiver -- cannot add a log entry without a household.");
  }

  // Two separate inserts, like signUpAndCreateHousehold's household+caregiver
  // pair -- not wrapped in a transaction (the anon/authenticated client can't
  // start one). If the second insert fails after the first succeeds, an
  // orphaned reason-tag-less entry could persist; accepted for now as the
  // same tradeoff already made there, revisit if it proves to matter.
  const { data: entryRow, error: entryError } = await client
    .from("log_entry")
    .insert({
      household_id: identity.householdId,
      food_id: input.foodId,
      child_id: input.childId,
      status: input.status,
      notes: input.notes ?? null,
      created_by: identity.caregiverId,
    })
    .select()
    .single();
  if (entryError) throw entryError;

  const { data: tagRows, error: tagError } = await client
    .from("log_entry_reason_tag")
    .insert(
      input.reasonTagIds.map((reasonTagId) => ({
        household_id: identity.householdId,
        log_entry_id: entryRow.id,
        reason_tag_id: reasonTagId,
      })),
    )
    .select("reason_tag_id");
  if (tagError) throw tagError;

  return toLogEntry(
    entryRow,
    tagRows.map((row) => row.reason_tag_id),
  );
}

/** Lists every log entry in the caller's household, most recent first --
 * a basic chronological view confirming entries persist across creation.
 * Relies on RLS (rather than an explicit household_id filter) to scope the
 * result, the same pattern `listChildren` uses. */
export async function listLogEntries(client: DataAccessClient): Promise<LogEntry[]> {
  const { data, error } = await client
    .from("log_entry")
    .select("*, log_entry_reason_tag(reason_tag_id)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return data.map((row) =>
    toLogEntry(
      row,
      row.log_entry_reason_tag.map((tag) => tag.reason_tag_id),
    ),
  );
}
