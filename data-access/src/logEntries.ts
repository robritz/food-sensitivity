import { getCurrentCaregiver } from "./auth.js";
import type { DataAccessClient } from "./client.js";
import type { Tables, TablesUpdate } from "./database.types.js";
import { filterLogEntries, type ActiveFilters, type LogEntryWithFood } from "./filtering.js";

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
  /** Null for entries logged without a captured/confirmed location (e.g.
   * geolocation permission denied, or from before ticket 10). */
  locationId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AddLogEntryInput {
  /** Caller-supplied id, used as the row's primary key instead of the
   * column's `gen_random_uuid()` default. Optional -- omit for the normal
   * online path. The offline sync queue (ticket 11) passes the id it
   * generated at enqueue time here, which is what lets `addLogEntry` be
   * called again for the same logical entry (a sync retry after a dropped
   * connection) without creating a duplicate row: see the id-conflict
   * handling below. */
  id?: string;
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
  /** Id of a Location resolved via `findOrCreateLocation` (ticket 10).
   * Omitted when geolocation wasn't available/granted or capture failed. */
  locationId?: string;
}

const MIN_INTENSITY = 1;
const MAX_INTENSITY = 5;

/**
 * Editable fields for `updateLogEntry`. Now that tickets 09 (intensity,
 * backdating, photos) and 10 (location) have landed, `intensity`,
 * `occurredAt`, and `locationId` join the originally-scoped `status`/
 * `reasonTagIds`/`notes` -- see the ticket 15 implementation notes for why
 * this shape was left additive. Photo edits (attach/remove) go through
 * `addLogEntryPhoto`/storage directly rather than this patch, since photos
 * aren't columns on `log_entry`.
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
  /** `null` clears an existing intensity rating; `undefined` leaves it
   * unchanged. Validated against the same 1-5 range as `addLogEntry`. */
  intensity?: number | null;
  /** Backdates/corrects "date happened"; omit to leave unchanged. */
  occurredAt?: string;
  /** `null` clears an entry's Location; `undefined` leaves it unchanged. */
  locationId?: string | null;
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
    intensity: row.intensity,
    occurredAt: row.occurred_at,
    locationId: row.location_id,
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
  // same tradeoff already made there, revisit if it proves to matter. When
  // `input.id` is given, both steps below are written to tolerate exactly
  // that partial-failure retry, since that's the offline sync queue's whole
  // reason for supplying one (see `AddLogEntryInput.id`).
  const { data: freshEntryRow, error: entryError } = await client
    .from("log_entry")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      household_id: identity.householdId,
      food_id: input.foodId,
      child_id: input.childId,
      status: input.status,
      notes: input.notes ?? null,
      intensity: input.intensity ?? null,
      occurred_at: input.occurredAt,
      location_id: input.locationId ?? null,
      created_by: identity.caregiverId,
    })
    .select()
    .single();

  let entryRow: Tables<"log_entry">;
  if (entryError) {
    // 23505 = unique_violation on the primary key -- only possible here when
    // `input.id` was supplied and a prior attempt already inserted this same
    // row (a sync retry, e.g. the response to the first attempt never made
    // it back to the caller). Treat that as success and fetch what's there,
    // rather than surfacing a spurious duplicate-key error -- the same
    // "fall back to the row a race/retry already created" pattern
    // `findOrCreateLocation` uses for its own unique constraint.
    if (entryError.code === "23505" && input.id) {
      const { data: existing, error: findError } = await client
        .from("log_entry")
        .select()
        .eq("id", input.id)
        .single();
      if (findError) throw findError;
      entryRow = existing;
    } else {
      throw entryError;
    }
  } else {
    entryRow = freshEntryRow;
  }

  // `upsert(..., { ignoreDuplicates: true })` rather than a plain `insert`:
  // a plain multi-row insert aborts entirely if *any* row already exists,
  // which would wrongly fail a retry that's also carrying reason tags a
  // partial first attempt never got to insert. Ignoring conflicts instead
  // means already-attached tags are left alone and only the missing ones are
  // added, whichever branch above produced `entryRow`.
  const { error: tagError } = await client.from("log_entry_reason_tag").upsert(
    input.reasonTagIds.map((reasonTagId) => ({
      household_id: identity.householdId,
      log_entry_id: entryRow.id,
      reason_tag_id: reasonTagId,
    })),
    { onConflict: "log_entry_id,reason_tag_id", ignoreDuplicates: true },
  );
  if (tagError) throw tagError;

  // Read back the full current tag set rather than trusting the upsert's own
  // (possibly ignore-duplicates-truncated) response, same reason
  // `updateLogEntry` re-selects after its delete+insert.
  const { data: tagRows, error: tagFindError } = await client
    .from("log_entry_reason_tag")
    .select("reason_tag_id")
    .eq("log_entry_id", entryRow.id);
  if (tagFindError) throw tagFindError;

  return toLogEntry(
    entryRow,
    tagRows.map((row) => row.reason_tag_id),
  );
}

export interface ListLogEntriesFilter {
  foodId?: string;
  childId?: string;
}

/** Lists log entries in the caller's household, most recent first -- a basic
 * chronological view confirming entries persist across creation. Optionally
 * narrowed to a single Food/Child pair, for the browse list's tap-through
 * history (ticket 12). Relies on RLS (rather than an explicit household_id
 * filter) to scope the result, the same pattern `listChildren` uses. */
export async function listLogEntries(client: DataAccessClient, filter?: ListLogEntriesFilter): Promise<LogEntry[]> {
  let query = client.from("log_entry").select("*, log_entry_reason_tag(reason_tag_id)");
  if (filter?.foodId) query = query.eq("food_id", filter.foodId);
  if (filter?.childId) query = query.eq("child_id", filter.childId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;

  return data.map((row) =>
    toLogEntry(
      row,
      row.log_entry_reason_tag.map((tag) => tag.reason_tag_id),
    ),
  );
}

export interface FoodStatusSummary {
  foodId: string;
  childId: string;
  /** id of the most recent entry for this Food/Child pair -- lets a caller
   * key off it (e.g. React list keys) without re-deriving one. */
  latestEntryId: string;
  status: LogEntryStatus;
  createdAt: string;
}

export interface ListFoodStatusSummaryOptions {
  /** Ticket 13's active filter selection -- OR within a filter type, AND
   * across types (see `ActiveFilters`). Omitted/empty means unfiltered. */
  filters?: ActiveFilters;
  /** Free-text search against Food name/brand, combined with `filters` as
   * AND (both must pass). Case-insensitive substring match. */
  search?: string;
}

/** Lists the most recent status for every (Food, Child) pair the caller's
 * household has logged an entry for -- the "one row per Food per child"
 * view the browse list (ticket 12) renders, optionally narrowed by ticket
 * 13's filters/search. Groups client-side rather than via a DB view: entries
 * are already ordered most-recent-first by RLS-scoped query, so the first
 * (filter-matching) row seen per (food_id, child_id) pair is its latest;
 * cheap and avoids a migration for what's a straightforward reduction over
 * data the household's RLS policy already scopes for us.
 *
 * Filtering/searching happens over full entries (via `filterLogEntries`)
 * *before* the per-pair reduction, so a pair only appears if it has at least
 * one entry matching every active filter type and the search text -- and the
 * status shown is that of its most recent *matching* entry, not necessarily
 * its most recent entry overall. */
export async function listFoodStatusSummary(
  client: DataAccessClient,
  options?: ListFoodStatusSummaryOptions,
): Promise<FoodStatusSummary[]> {
  const { data, error } = await client
    .from("log_entry")
    .select(
      "id, household_id, food_id, child_id, status, notes, intensity, occurred_at, location_id, created_by, created_at, log_entry_reason_tag(reason_tag_id), food(id, name, category_id)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  const entriesWithFood: LogEntryWithFood[] = data.map((row) => ({
    entry: toLogEntry(
      row,
      row.log_entry_reason_tag.map((tag) => tag.reason_tag_id),
    ),
    food: { id: row.food.id, name: row.food.name, categoryId: row.food.category_id },
  }));

  const matching =
    options?.filters || options?.search
      ? filterLogEntries(entriesWithFood, options?.filters ?? {}, options?.search)
      : entriesWithFood;

  const latestByPair = new Map<string, FoodStatusSummary>();
  for (const { entry } of matching) {
    const key = `${entry.foodId}:${entry.childId}`;
    if (latestByPair.has(key)) continue; // already saw a more recent matching row for this pair
    latestByPair.set(key, {
      foodId: entry.foodId,
      childId: entry.childId,
      latestEntryId: entry.id,
      status: entry.status,
      createdAt: entry.createdAt,
    });
  }
  return Array.from(latestByPair.values());
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
export interface AddLogEntryPhotoOptions {
  /** Caller-supplied id used in the storage path instead of a fresh
   * `crypto.randomUUID()`. Optional -- omit for the normal online path. The
   * offline sync queue (ticket 11) generates one per queued photo at enqueue
   * time and passes it here on every sync attempt, so a retried upload (the
   * first attempt's request succeeded but its response never made it back)
   * overwrites the same storage object instead of attaching a duplicate. */
  photoId?: string;
}

export async function addLogEntryPhoto(
  client: DataAccessClient,
  logEntryId: string,
  file: File,
  options?: AddLogEntryPhotoOptions,
): Promise<LogEntryPhoto> {
  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("No signed-in caregiver -- cannot attach a photo without a household.");
  }

  const path = `${identity.householdId}/${logEntryId}/${options?.photoId ?? crypto.randomUUID()}-${file.name}`;

  // Checked here (not just left to a future "4 photos" glance in the UI) so
  // the limit holds even if two uploads race or a caller skips the UI. A
  // retry of a photo that's already attached (same `path`, from the same
  // `photoId`) doesn't count against the cap -- it's not a new photo, just
  // this same upload being reattempted.
  const existing = await listLogEntryPhotos(client, logEntryId);
  const alreadyUploaded = existing.some((photo) => photo.path === path);
  if (!alreadyUploaded && existing.length >= MAX_PHOTOS_PER_LOG_ENTRY) {
    throw new Error(`An entry can have at most ${MAX_PHOTOS_PER_LOG_ENTRY} photos.`);
  }

  // `upsert: true` so a retried upload (same path) overwrites the object
  // already sitting there from a prior attempt instead of erroring.
  const { error } = await client.storage.from(ENTRY_PHOTOS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: true,
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
  if (
    input.intensity !== undefined &&
    input.intensity !== null &&
    (input.intensity < MIN_INTENSITY || input.intensity > MAX_INTENSITY)
  ) {
    throw new Error(`Intensity must be between ${MIN_INTENSITY} and ${MAX_INTENSITY}.`);
  }

  const patch: TablesUpdate<"log_entry"> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.intensity !== undefined) patch.intensity = input.intensity;
  if (input.occurredAt !== undefined) patch.occurred_at = input.occurredAt;
  if (input.locationId !== undefined) patch.location_id = input.locationId;

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
