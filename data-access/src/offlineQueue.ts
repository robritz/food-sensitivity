import { addLogEntry, addLogEntryPhoto, type AddLogEntryInput, type LogEntry } from "./logEntries.js";
import { findOrCreateLocation, type FindOrCreateLocationInput } from "./locations.js";
import type { DataAccessClient } from "./client.js";

/** A photo captured while offline, waiting to be uploaded. `id` is generated
 * once at enqueue time (not at upload time, unlike the online path's
 * `crypto.randomUUID()`) and reused across every sync attempt, so a retried
 * upload overwrites the same storage object instead of attaching a
 * duplicate -- see `AddLogEntryPhotoOptions.photoId`. */
export interface QueuedPhoto {
  id: string;
  name: string;
  blob: Blob;
}

/** A location captured while offline: raw coordinates and whatever name was
 * shown/typed, not yet resolved to a `Location` row -- resolving it means
 * calling `findOrCreateLocation` (a Supabase round-trip), which can't happen
 * until sync time. Mirrors `FindOrCreateLocationInput` exactly; kept as a
 * separate named type so a `QueuedLogEntry` reads self-descriptively. */
export type QueuedLocationCapture = FindOrCreateLocationInput;

/** A fully-formed log entry -- everything `addLogEntry`/`addLogEntryPhoto`/
 * `findOrCreateLocation` need -- captured while offline and waiting for
 * `syncQueuedEntries` to actually create it on the server. */
export interface QueuedLogEntry {
  /** Generated once at enqueue time (not at sync time). Doubles as:
   * (a) the eventual `log_entry.id`, and (b) the idempotency key that makes
   * repeated sync attempts for this same queued item safe -- see
   * `AddLogEntryInput.id`. */
  clientId: string;
  /** Everything `addLogEntry` needs except `id` (supplied separately as
   * `clientId`, so callers can't accidentally desync the two) and
   * `locationId` (not known yet -- resolved from `location` at sync time). */
  input: Omit<AddLogEntryInput, "id" | "locationId">;
  /** Omitted when the entry was logged with no place, same as the online
   * path leaving `locationId` undefined. */
  location?: QueuedLocationCapture;
  photos: QueuedPhoto[];
}

export interface SyncSuccess {
  clientId: string;
  status: "synced";
  entry: LogEntry;
}

export interface SyncFailure {
  clientId: string;
  status: "failed";
  error: unknown;
}

export type SyncOutcome = SyncSuccess | SyncFailure;

/**
 * Drains a batch of queued entries against Supabase, one at a time (not in
 * parallel -- a reconnect after a spell offline is exactly when the network
 * is least trustworthy, so entries sync in sequence rather than racing each
 * other). Every step (location resolution, the entry insert, each photo
 * upload) is idempotent on retry -- see `QueuedLogEntry.clientId` and
 * `QueuedPhoto.id` -- so calling this again with the same items (e.g. the
 * caller hasn't dequeued a "succeeded" item yet, or a second `online` event
 * fires before the first sync finished) never creates a duplicate on the
 * server.
 *
 * Never throws: a failed item is reported via its `SyncOutcome`, not a
 * rejected promise, so one bad item (still offline mid-batch, a validation
 * error, whatever) doesn't stop the rest of the batch from syncing. Callers
 * are expected to dequeue "synced" outcomes and leave "failed" ones queued
 * for the next reconnect attempt.
 */
export async function syncQueuedEntries(
  client: DataAccessClient,
  queued: QueuedLogEntry[],
): Promise<SyncOutcome[]> {
  const outcomes: SyncOutcome[] = [];
  for (const item of queued) {
    try {
      let locationId: string | undefined;
      if (item.location) {
        const location = await findOrCreateLocation(client, item.location);
        locationId = location.id;
      }

      const entry = await addLogEntry(client, { ...item.input, id: item.clientId, locationId });

      for (const photo of item.photos) {
        const file = new File([photo.blob], photo.name, { type: photo.blob.type || undefined });
        await addLogEntryPhoto(client, entry.id, file, { photoId: photo.id });
      }

      outcomes.push({ clientId: item.clientId, status: "synced", entry });
    } catch (error) {
      outcomes.push({ clientId: item.clientId, status: "failed", error });
    }
  }
  return outcomes;
}
