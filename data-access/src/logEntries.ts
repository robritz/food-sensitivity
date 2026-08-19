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
  /** Optional 1-5 caregiver-set intensity rating for the reaction. */
  intensity: number | null;
  /** "Date happened" -- defaults to submission time but is editable to a
   * past date (backdating), unlike createdAt which always reflects when the
   * row was inserted. */
  occurredAt: string;
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
  /** Optional 1-5 intensity rating; validated client-side here since the
   * check constraint's error message isn't friendly. */
  intensity?: number;
  /** Defaults to now() (via the column default) when omitted -- pass an
   * earlier ISO timestamp to backdate "date happened". */
  occurredAt?: string;
}

const MIN_INTENSITY = 1;
const MAX_INTENSITY = 5;

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
    intensity: row.intensity,
    occurredAt: row.occurred_at,
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
  if (input.intensity !== undefined && (input.intensity < MIN_INTENSITY || input.intensity > MAX_INTENSITY)) {
    throw new Error(`Intensity must be between ${MIN_INTENSITY} and ${MAX_INTENSITY}.`);
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
      intensity: input.intensity ?? null,
      occurred_at: input.occurredAt,
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

const ENTRY_PHOTOS_BUCKET = "entry-photos";

/** A caregiver can attach at most this many photos to a single entry. */
export const MAX_PHOTOS_PER_LOG_ENTRY = 4;

export interface LogEntryPhoto {
  /** Storage object path -- pass to `getLogEntryPhotoUrl` to view it. */
  path: string;
  name: string;
  createdAt: string;
}

/**
 * Attaches a photo to an existing LogEntry, uploaded to the private
 * `entry-photos` Storage bucket rather than tracked in its own table --
 * there's no per-photo metadata beyond the file itself, so the storage
 * object *is* the record.
 *
 * Stored at `${householdId}/${logEntryId}/${randomUUID}-${file.name}`:
 * storage RLS (see the 09 migration) reads the household id straight out of
 * that path, the same way row-level policies elsewhere compare a
 * `household_id` column to `current_household_id()` -- just expressed as a
 * path segment since storage objects have no columns to filter on. That RLS
 * is also what the ticket's required integration test exercises.
 */
export async function addLogEntryPhoto(
  client: DataAccessClient,
  logEntryId: string,
  file: File,
): Promise<LogEntryPhoto> {
  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("No signed-in caregiver -- cannot attach a photo without a household.");
  }

  // Checked here (not just left to a future "4 photos" glance in the UI) so
  // the limit holds even if two uploads race or a caller skips the UI.
  const existing = await listLogEntryPhotos(client, logEntryId);
  if (existing.length >= MAX_PHOTOS_PER_LOG_ENTRY) {
    throw new Error(`An entry can have at most ${MAX_PHOTOS_PER_LOG_ENTRY} photos.`);
  }

  const path = `${identity.householdId}/${logEntryId}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await client.storage.from(ENTRY_PHOTOS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
  });
  if (error) throw error;

  return { path, name: file.name, createdAt: new Date().toISOString() };
}

/** Lists the photos attached to a LogEntry. Relies on storage RLS (rather
 * than an explicit filter) to scope results to the caller's household, the
 * same pattern the row-level `listX` functions use. */
export async function listLogEntryPhotos(client: DataAccessClient, logEntryId: string): Promise<LogEntryPhoto[]> {
  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("No signed-in caregiver -- cannot list photos without a household.");
  }

  const prefix = `${identity.householdId}/${logEntryId}`;
  const { data, error } = await client.storage.from(ENTRY_PHOTOS_BUCKET).list(prefix);
  if (error) throw error;

  return data.map((object) => ({
    path: `${prefix}/${object.name}`,
    name: object.name,
    createdAt: object.created_at ?? new Date().toISOString(),
  }));
}

/** A short-lived signed URL for viewing a private entry photo -- the bucket
 * isn't public, so photos aren't reachable by a bare storage URL. */
export async function getLogEntryPhotoUrl(
  client: DataAccessClient,
  path: string,
  expiresInSeconds = 60,
): Promise<string> {
  const { data, error } = await client.storage.from(ENTRY_PHOTOS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
