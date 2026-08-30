import {
  listCategories,
  listChildren,
  listFoods,
  listLogEntries,
  listLogEntryIdsWithPhotos,
  listReasonTags,
  type Category,
  type Child,
  type Food,
  type LogEntry,
  type QueuedLogEntry,
  type ReasonTag,
} from '@food-tracker/data-access'
import { Alert, Box, CircularProgress, Divider, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { AppLayout } from '../components/AppLayout'
import { dataAccessClient } from '../lib/dataAccessClient'
import { listQueuedEntries } from '../lib/offlineQueueStore'
import { runOfflineSync } from '../lib/offlineSync'
import { AddEntryForm } from './log/AddEntryForm'
import { DeleteEntryDialog } from './log/DeleteEntryDialog'
import { EditEntryDialog } from './log/EditEntryDialog'
import { EntryDetailDialog } from './log/EntryDetailDialog'
import { EntryList } from './log/EntryList'
import { FoodList } from './log/FoodList'
import { QueuedEntryList } from './log/QueuedEntryList'

/** Coordinates the food-log page: loads the household's shared data (children,
 * foods, categories, reason tags, entries) and the offline queue, keeps them
 * in sync with connectivity, and hands slices to the add-entry form, the
 * lists, and the detail/edit/delete dialogs. Each of those owns its own
 * interaction state; this component only holds the shared data and which
 * entry (if any) each dialog is currently open for. */
export function LogPage() {
  const [children, setChildren] = useState<Child[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [reasonTags, setReasonTags] = useState<ReasonTag[]>([])
  const [entries, setEntries] = useState<LogEntry[]>([])
  // Which entries have at least one attached photo, for the list's photo
  // icon (ticket 17 follow-up). Refetched whenever `entries` changes rather
  // than threaded through every add/edit/delete call site -- one cheap
  // storage `list` call, same simplicity tradeoff `addLogEntryPhoto` makes
  // when it re-lists photos on every upload to check the cap.
  const [entryIdsWithPhotos, setEntryIdsWithPhotos] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Tracked via events (not read ad hoc via `navigator.onLine`) so children
  // that behave differently online vs. offline -- like the food search and
  // location picker -- can list it as a dependency and re-run the moment
  // connectivity changes, instead of only reacting to it lazily on the next
  // keystroke.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  // Entries created while offline (ticket 11): queued in IndexedDB, shown
  // separately below so it's visibly "queued, not yet on the server" rather
  // than mixed into `entries` (which only ever holds what's actually been
  // read back from Supabase).
  const [queuedEntries, setQueuedEntries] = useState<QueuedLogEntry[]>([])

  // Which entry each dialog is open for (null = closed). The dialogs
  // themselves own the rest of their interaction state.
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<LogEntry | null>(null)
  const [viewingEntry, setViewingEntry] = useState<LogEntry | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listChildren(dataAccessClient),
      listFoods(dataAccessClient),
      listCategories(dataAccessClient),
      listReasonTags(dataAccessClient),
      listLogEntries(dataAccessClient),
    ])
      .then(([childrenResult, foodsResult, categoriesResult, reasonTagsResult, entriesResult]) => {
        if (cancelled) return
        setChildren(childrenResult)
        setFoods(foodsResult)
        setCategories(categoriesResult)
        setReasonTags(reasonTagsResult)
        setEntries(entriesResult)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load the food log.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Keeps the "has photos" set in sync with `entries` -- re-lists on every
  // add/edit/delete rather than trying to patch the set incrementally.
  // Best-effort: a failure here just leaves entries without a photo icon,
  // it shouldn't block the rest of the page.
  useEffect(() => {
    if (entries.length === 0) {
      setEntryIdsWithPhotos(new Set())
      return
    }
    let cancelled = false
    listLogEntryIdsWithPhotos(dataAccessClient)
      .then((ids) => {
        if (!cancelled) setEntryIdsWithPhotos(ids)
      })
      .catch(() => {
        // Best-effort -- see comment above.
      })
    return () => {
      cancelled = true
    }
  }, [entries])

  // Loads whatever's already queued from a prior offline session (e.g. the
  // caregiver logged an entry offline, closed the tab, and reopened it
  // before reconnecting) so it's visible immediately, independent of the
  // sync attempt below.
  useEffect(() => {
    let cancelled = false
    listQueuedEntries()
      .then((stored) => {
        if (!cancelled) setQueuedEntries(stored)
      })
      .catch(() => {
        // Best-effort -- an unreadable queue shouldn't block the rest of the page.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Drains the offline queue (ticket 11) once on mount (covers "was offline,
  // reopened the app after reconnecting") and again on every browser
  // `online` event (covers "was open the whole time, connectivity just came
  // back"). `runOfflineSync` is safe to call with an empty or already-synced
  // queue, and safe to overlap with itself -- each queued entry's sync is
  // idempotent (see `syncQueuedEntries`), so a redundant run just re-confirms
  // "already synced" for anything a previous run already dequeued.
  useEffect(() => {
    let cancelled = false
    async function trySync() {
      if (!navigator.onLine) return
      const result = await runOfflineSync(dataAccessClient)
      if (cancelled || result.syncedClientIds.length === 0) return
      setQueuedEntries((current) => current.filter((entry) => !result.syncedClientIds.includes(entry.clientId)))
      // Newly-synced entries now exist server-side -- refresh so they show
      // up in "Recent entries" instead of only having ever appeared queued.
      listLogEntries(dataAccessClient)
        .then((refreshed) => {
          if (!cancelled) setEntries(refreshed)
        })
        .catch(() => {
          // Best-effort refresh -- the sync itself already succeeded.
        })
    }
    trySync()
    window.addEventListener('online', trySync)
    return () => {
      cancelled = true
      window.removeEventListener('online', trySync)
    }
  }, [])

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }
    function handleOffline() {
      setIsOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (loading) {
    return (
      <AppLayout title="Food log">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress />
        </Box>
      </AppLayout>
    )
  }
  if (loadError) {
    return (
      <AppLayout title="Food log">
        <Alert severity="error">{loadError}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Food log">
      <Typography variant="h6" component="h2" gutterBottom>
        Log an entry
      </Typography>
      <AddEntryForm
        childProfiles={children}
        foods={foods}
        categories={categories}
        reasonTags={reasonTags}
        isOnline={isOnline}
        onEntryAdded={(entry) => setEntries((current) => [entry, ...current])}
        onEntryQueued={(queuedEntry) => setQueuedEntries((current) => [queuedEntry, ...current])}
        onFoodAdded={(food) =>
          setFoods((current) => [...current, food].sort((a, b) => a.name.localeCompare(b.name)))
        }
        onCategoryAdded={(category) =>
          setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)))
        }
        onReasonTagAdded={(tag) =>
          setReasonTags((current) => [...current, tag].sort((a, b) => a.name.localeCompare(b.name)))
        }
      />

      {queuedEntries.length > 0 && (
        <QueuedEntryList
          queuedEntries={queuedEntries}
          childProfiles={children}
          foods={foods}
          reasonTags={reasonTags}
        />
      )}

      <Divider sx={{ mb: 3 }} />

      <Typography variant="h6" component="h2" gutterBottom>
        Recent entries
      </Typography>
      <EntryList
        entries={entries}
        childProfiles={children}
        foods={foods}
        reasonTags={reasonTags}
        entryIdsWithPhotos={entryIdsWithPhotos}
        onView={setViewingEntry}
        onEdit={setEditingEntry}
        onDelete={setDeletingEntry}
      />

      <EditEntryDialog
        entry={editingEntry}
        reasonTags={reasonTags}
        onClose={() => setEditingEntry(null)}
        onSaved={(updated) => {
          setEntries((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
          setEditingEntry(null)
        }}
      />

      <DeleteEntryDialog
        entry={deletingEntry}
        childProfiles={children}
        foods={foods}
        onClose={() => setDeletingEntry(null)}
        onDeleted={(id) => {
          setEntries((current) => current.filter((entry) => entry.id !== id))
          setDeletingEntry(null)
        }}
      />

      <EntryDetailDialog
        entry={viewingEntry}
        childProfiles={children}
        foods={foods}
        reasonTags={reasonTags}
        onClose={() => setViewingEntry(null)}
      />

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" component="h2" gutterBottom>
        All foods
      </Typography>
      <FoodList foods={foods} categories={categories} />
    </AppLayout>
  )
}
