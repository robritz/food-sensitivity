import { getCurrentCaregiver } from "./auth.js";
import type { DataAccessClient } from "./client.js";
import type { Tables, TablesUpdate } from "./database.types.js";

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

/**
 * Editable fields for `updateLogEntry`. Deliberately partial/additive so
 * tickets 09 (intensity, backdating, photos) and 10 (location) can extend
 * this with `intensity?`, `occurredAt?`, `photoUrls?`, `locationId?` (or
 * similar) as small additions once they merge, rather than needing a
 * rewrite -- see the ticket 15 implementation notes.
 *
 * `foodId`/`childId` are intentionally excluded -- which Food/Child an
 * entry belongs to stays fixed; only its content fields are editable.
 */
export interface UpdateLogEntryInput {
  status?: LogEntryStatus;
  /** If provided, replaces the entry's *entire* set of reason tags (not
   * merged in) -- mirrors `AddLogEntryInput.reasonTagIds` taking the
   * complete list. Must be non-empty if provided, same "must say why" rule
   * as creation. */
  reasonTagIds?: string[];
  /** `null` clears existing notes; `undefined` (i.e. omitted) leaves notes
   * unchanged. */
  notes?: string | null;
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

/**
 * Updates an existing LogEntry's editable fields (status, reason tags,
 * notes). Any caregiver in the entry's household may edit it regardless of
 * who created it -- RLS scopes the update policy by `household_id` only
 * (not `created_by`), the same "any member, not just the creator" pattern
 * as `food`/`child` inserts. A caregiver outside the household matches no
 * row under RLS, so the trailing `.single()` throws.
 *
 * This reverses ticket 06's "append-only by omission" for a *single* entry
 * -- editing one row never touches any other `log_entry` row, so ticket
 * 06's cross-entry history (repeated logging for the same Food/Child pair
 * doesn't overwrite prior entries) is unaffected.
 */
export async function updateLogEntry(
  client: DataAccessClient,
  entryId: string,
  input: UpdateLogEntryInput,
): Promise<LogEntry> {
  if (input.reasonTagIds && input.reasonTagIds.length === 0) {
    throw new Error("An entry needs at least one reason tag.");
  }

  const patch: TablesUpdate<"log_entry"> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes;

  let entryRow: Tables<"log_entry">;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await client.from("log_entry").update(patch).eq("id", entryId).select().single();
    if (error) throw error;
    entryRow = data;
  } else {
    // Nothing on the row itself changed (e.g. only reasonTagIds was given)
    // -- still need the current row for household_id and the return value.
    const { data, error } = await client.from("log_entry").select().eq("id", entryId).single();
    if (error) throw error;
    entryRow = data;
  }

  // Reason tags are replaced wholesale: delete the entry's current tag rows,
  // then insert the new set. Simpler than diffing, and the join table has
  // no other state to lose.
  if (input.reasonTagIds) {
    const { error: deleteError } = await client.from("log_entry_reason_tag").delete().eq("log_entry_id", entryId);
    if (deleteError) throw deleteError;

    const { error: insertError } = await client.from("log_entry_reason_tag").insert(
      input.reasonTagIds.map((reasonTagId) => ({
        household_id: entryRow.household_id,
        log_entry_id: entryId,
        reason_tag_id: reasonTagId,
      })),
    );
    if (insertError) throw insertError;
  }

  const { data: tagRows, error: tagError } = await client
    .from("log_entry_reason_tag")
    .select("reason_tag_id")
    .eq("log_entry_id", entryId);
  if (tagError) throw tagError;

  return toLogEntry(
    entryRow,
    tagRows.map((row) => row.reason_tag_id),
  );
}

/**
 * Deletes an existing LogEntry. Any caregiver in the entry's household may
 * delete it regardless of who created it, same household-only RLS scoping
 * as `updateLogEntry`. `log_entry_reason_tag` rows cascade via their FK's
 * `on delete cascade` (ticket 06), so no separate cleanup call is needed.
 * Deleting one entry never touches any other `log_entry` row, so ticket
 * 06's cross-entry history for the rest of that Food's log is unaffected.
 */
export async function deleteLogEntry(client: DataAccessClient, entryId: string): Promise<void> {
  const { data, error } = await client.from("log_entry").delete().eq("id", entryId).select("id");
  if (error) throw error;
  if (data.length === 0) {
    throw new Error("Log entry not found, or you don't have access to it.");
  }
}
