import { syncQueuedEntries, type DataAccessClient } from '@food-tracker/data-access'
import { listQueuedEntries, removeQueuedEntry } from './offlineQueueStore'

export interface OfflineSyncResult {
  /** clientIds of entries that synced this run and were removed from the queue. */
  syncedClientIds: string[]
  /** clientIds still queued (either they failed this attempt, e.g. still
   * offline, or nothing was queued to begin with). */
  remainingClientIds: string[]
}

// Drains whatever is currently in the IndexedDB queue against Supabase.
// Safe to call repeatedly/concurrently-ish (e.g. once on mount and again on
// the very next `online` event) -- `syncQueuedEntries` is idempotent per
// entry (see its own docs), and a "synced" entry is removed from the store
// right away so a second call sees a shorter (or empty) queue rather than
// resubmitting something that already landed.
export async function runOfflineSync(client: DataAccessClient): Promise<OfflineSyncResult> {
  const queued = await listQueuedEntries()
  if (queued.length === 0) {
    return { syncedClientIds: [], remainingClientIds: [] }
  }

  const outcomes = await syncQueuedEntries(client, queued)

  const syncedClientIds: string[] = []
  const remainingClientIds: string[] = []
  for (const outcome of outcomes) {
    if (outcome.status === 'synced') {
      await removeQueuedEntry(outcome.clientId)
      syncedClientIds.push(outcome.clientId)
    } else {
      remainingClientIds.push(outcome.clientId)
    }
  }
  return { syncedClientIds, remainingClientIds }
}
