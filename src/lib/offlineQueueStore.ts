import type { QueuedLogEntry } from '@food-tracker/data-access'

// Persists entries queued while offline (ticket 11) in IndexedDB rather than
// localStorage: `QueuedPhoto.blob` holds the actual photo bytes, and
// IndexedDB stores Blobs natively (localStorage only holds strings, which
// would mean base64-encoding every photo -- a third more bytes, and a
// synchronous encode/decode of possibly multi-megabyte data on the main
// thread). IndexedDB also survives a page reload the same way localStorage
// does, which matters here: a caregiver who logs an entry offline and closes
// the tab before reconnecting still needs it queued next time the app opens.
const DB_NAME = 'food-tracker-offline-queue'
const DB_VERSION = 1
const STORE_NAME = 'queued-log-entries'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'clientId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open the offline queue database.'))
  })
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Offline queue request failed.'))
  })
}

/** All entries currently queued, oldest first is not guaranteed -- callers
 * that care about order should sort by whatever they stash on the entry
 * (e.g. `input.occurredAt`). */
export async function listQueuedEntries(): Promise<QueuedLogEntry[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readonly')
    return await runRequest(tx.objectStore(STORE_NAME).getAll())
  } finally {
    db.close()
  }
}

/** Adds a newly-queued entry, or overwrites one with the same `clientId` if
 * called again (shouldn't normally happen -- `clientId`s are generated fresh
 * per entry -- but keeps this idempotent rather than erroring). */
export async function addQueuedEntry(entry: QueuedLogEntry): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(entry)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Failed to queue the entry.'))
    })
  } finally {
    db.close()
  }
}

/** Removes a queued entry once it's synced -- the caller's job to invoke
 * after `syncQueuedEntries` reports it as `"synced"`. */
export async function removeQueuedEntry(clientId: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(clientId)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Failed to remove the synced entry from the queue.'))
    })
  } finally {
    db.close()
  }
}
