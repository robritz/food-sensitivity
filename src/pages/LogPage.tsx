import {
  addCategory,
  addFood,
  addLogEntry,
  addLogEntryPhoto,
  addReasonTag,
  deleteLogEntry,
  findOrCreateLocation,
  getLogEntryPhotoUrl,
  listCategories,
  listChildren,
  listFoods,
  listLogEntries,
  listLogEntryIdsWithPhotos,
  listLogEntryPhotos,
  listReasonTags,
  MAX_PHOTOS_PER_LOG_ENTRY,
  reverseGeocode,
  searchFoods,
  updateLogEntry,
  type Category,
  type Child,
  type Food,
  type LogEntry,
  type LogEntryPhoto,
  type LogEntryStatus,
  type QueuedLocationCapture,
  type QueuedLogEntry,
  type ReasonTag,
} from '@food-tracker/data-access'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  Rating,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AppLayout } from '../components/AppLayout'
import { dataAccessClient } from '../lib/dataAccessClient'
import { runOfflineSync } from '../lib/offlineSync'
import { addQueuedEntry, listQueuedEntries } from '../lib/offlineQueueStore'
import { filterFoodsOffline } from '../lib/offlineFoodSearch'
import { sortLogEntryPhotos } from '../lib/entryPhotos'

const FOOD_SEARCH_DEBOUNCE_MS = 250

const STATUSES: LogEntryStatus[] = ['liked', 'disliked', 'inconsistent']

/** "Date happened" as a `datetime-local`-input-compatible string, in the
 * caregiver's local time zone (unlike `toISOString`, which is always UTC and
 * would show the wrong wall-clock time in the field). */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function statusLabel(status: LogEntryStatus): string {
  return status[0].toUpperCase() + status.slice(1)
}

interface NamedOption {
  id: string
  name: string
}

/** Manages the value/inputValue pair for a freeSolo MUI Autocomplete backed
 * by named options (Food, Category): typing updates the free-typed text and
 * clears the selection; picking an option syncs both. Ignores MUI's own
 * 'reset' notification (fired e.g. on blur) -- it would otherwise wipe out
 * free-typed text that hasn't matched an option; selecting an option updates
 * the displayed text via onChange instead. */
function useFreeSoloPicker<T extends NamedOption>() {
  const [value, setValue] = useState<T | null>(null)
  const [inputValue, setInputValue] = useState('')

  return {
    value,
    inputValue,
    setValue,
    setInputValue,
    autocompleteProps: {
      value,
      inputValue,
      getOptionLabel: (option: T | string) => (typeof option === 'string' ? option : option.name),
      isOptionEqualToValue: (option: T | string, val: T | string) =>
        typeof option !== 'string' && typeof val !== 'string' && option.id === val.id,
      onInputChange: (_event: unknown, newInputValue: string, reason: string) => {
        if (reason === 'reset') return
        setInputValue(newInputValue)
        if (reason === 'input') setValue(null)
      },
      onChange: (_event: unknown, newValue: T | string | null) => {
        if (newValue && typeof newValue !== 'string') {
          setValue(newValue)
          setInputValue(newValue.name)
        } else {
          setValue(null)
        }
      },
    },
  }
}

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

  // Tracked via events (not read ad hoc via `navigator.onLine`) so effects
  // that behave differently online vs. offline -- like the food search below
  // -- can list it as a dependency and re-run the moment connectivity
  // changes, instead of only reacting to it lazily on the next keystroke.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  // Entries created while offline (ticket 11): queued in IndexedDB via
  // `addQueuedEntry`, shown separately below so it's visibly "queued, not
  // yet on the server" rather than mixed into `entries` (which only ever
  // holds what's actually been read back from Supabase).
  const [queuedEntries, setQueuedEntries] = useState<QueuedLogEntry[]>([])

  const categoryPicker = useFreeSoloPicker<Category>()
  const { setValue: setDefaultCategory, setInputValue: setDefaultCategoryInputValue } = categoryPicker
  const foodPicker = useFreeSoloPicker<Food>()
  const [foodOptions, setFoodOptions] = useState<Food[]>([])
  const [foodSearchLoading, setFoodSearchLoading] = useState(false)

  const [entryChildId, setEntryChildId] = useState('')
  const [entryStatus, setEntryStatus] = useState<LogEntryStatus>('liked')
  const [entryReasonTagIds, setEntryReasonTagIds] = useState<string[]>([])
  const [entryNotes, setEntryNotes] = useState('')
  const [entryIntensity, setEntryIntensity] = useState<number | null>(null)
  const [entryOccurredAt, setEntryOccurredAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [entryPhotos, setEntryPhotos] = useState<File[]>([])
  const [entryPhotoError, setEntryPhotoError] = useState<string | null>(null)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [addingEntry, setAddingEntry] = useState(false)

  const [newReasonTagInput, setNewReasonTagInput] = useState('')
  const [addingReasonTag, setAddingReasonTag] = useState(false)
  const [reasonTagError, setReasonTagError] = useState<string | null>(null)

  // GPS coordinates captured once per page visit (ticket 10) -- not
  // re-requested per entry, since a caregiver logging several entries in one
  // sitting is almost always still in the same place. `locationCoords` stays
  // null if permission is denied or the device has no geolocation, in which
  // case entries are simply logged without a place.
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationMapboxPlaceId, setLocationMapboxPlaceId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState('')
  const [locationStatus, setLocationStatus] = useState<'locating' | 'geocoding' | 'ready' | 'unavailable'>(
    'locating',
  )

  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null)
  const [editStatus, setEditStatus] = useState<LogEntryStatus>('liked')
  const [editReasonTagIds, setEditReasonTagIds] = useState<string[]>([])
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingEntry, setDeletingEntry] = useState<LogEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Single-entry detail view (ticket 17). `viewingPhotoUrls` holds freshly
  // signed URLs fetched each time the dialog opens -- they expire after 60s
  // (private bucket), so they're never persisted onto `entries`/list state,
  // only kept here for as long as the dialog is open.
  const [viewingEntry, setViewingEntry] = useState<LogEntry | null>(null)
  const [viewingPhotos, setViewingPhotos] = useState<LogEntryPhoto[]>([])
  const [viewingPhotoUrls, setViewingPhotoUrls] = useState<Record<string, string>>({})
  const [viewingPhotosLoading, setViewingPhotosLoading] = useState(false)
  const [viewingPhotosError, setViewingPhotosError] = useState<string | null>(null)
  const [lightboxPath, setLightboxPath] = useState<string | null>(null)
  // Bumped on every openDetailDialog call; an in-flight fetch only applies
  // its result if its id is still current, so a superseded open (clicking a
  // different entry before the first one's photos load) is discarded.
  const viewingRequestIdRef = useRef(0)

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
        if (categoriesResult.length > 0) {
          setDefaultCategory(categoriesResult[0])
          setDefaultCategoryInputValue(categoriesResult[0].name)
        }
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
  }, [setDefaultCategory, setDefaultCategoryInputValue])

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

  // Captures the device's current GPS coordinates once per page visit (with
  // permission) and reverse-geocodes them into a suggested place name via
  // Mapbox (ticket 10). Both steps degrade gracefully: no geolocation
  // support, denied permission, a missing VITE_MAPBOX_TOKEN, or a failed
  // Mapbox call all just leave the place field for manual entry rather than
  // blocking entry creation -- `reverseGeocode` itself already swallows
  // Mapbox-side failures and resolves to null.
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable')
      return
    }
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        const { latitude, longitude } = position.coords
        setLocationCoords({ latitude, longitude })

        const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
        if (!token) {
          setLocationStatus('ready')
          return
        }
        setLocationStatus('geocoding')
        reverseGeocode(latitude, longitude, token)
          .then((match) => {
            if (cancelled) return
            if (match) {
              setLocationMapboxPlaceId(match.mapboxPlaceId)
              setLocationName(match.name)
            }
            setLocationStatus('ready')
          })
          .catch(() => {
            if (!cancelled) setLocationStatus('ready')
          })
      },
      () => {
        if (!cancelled) setLocationStatus('unavailable')
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Searches existing household Foods as the caregiver types, so they can
  // reuse a match instead of creating a duplicate. Skipped once a food has
  // been selected and the input still reflects its name.
  //
  // Offline (ticket 11 only allows logging against an existing food), there's
  // no network round-trip to make -- `searchFoods` would just fail silently
  // and leave the picker with no options. `foods` was already loaded on
  // mount, so filter that in memory instead, mirroring `searchFoods`' own
  // case-insensitive substring match.
  useEffect(() => {
    const query = foodPicker.inputValue.trim()
    if (foodPicker.value && foodPicker.value.name === foodPicker.inputValue) return
    if (query === '') {
      setFoodOptions([])
      return
    }
    if (!isOnline) {
      setFoodOptions(filterFoodsOffline(foods, query))
      setFoodSearchLoading(false)
      return
    }
    let cancelled = false
    setFoodSearchLoading(true)
    const timeoutId = setTimeout(() => {
      searchFoods(dataAccessClient, query)
        .then((results) => {
          if (!cancelled) setFoodOptions(results)
        })
        .catch(() => {
          if (!cancelled) setFoodOptions([])
        })
        .finally(() => {
          if (!cancelled) setFoodSearchLoading(false)
        })
    }, FOOD_SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [foodPicker.inputValue, foodPicker.value, foods, isOnline])

  function toggleReasonTag(id: string) {
    setEntryReasonTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    )
  }

  // Finds a same-name match (case-insensitive) among already-loaded named
  // options -- used before creating a custom category/reason tag so a typo
  // in casing (e.g. "fruit" vs "Fruit") reuses the existing one instead of
  // spawning a confusing near-duplicate.
  function findByNameCaseInsensitive<T extends NamedOption>(options: T[], name: string): T | undefined {
    return options.find((option) => option.name.toLowerCase() === name.toLowerCase())
  }

  // Reuses the selected category if the caregiver picked one, or a same-name
  // existing one if they typed a match by hand; otherwise adds it as a new
  // custom category for the household (ticket 08) before using it.
  async function resolveCategoryId(): Promise<string> {
    if (categoryPicker.value) return categoryPicker.value.id
    const name = categoryPicker.inputValue.trim()
    if (name === '') throw new Error('Choose or enter a category.')
    const existing = findByNameCaseInsensitive(categories, name)
    if (existing) return existing.id
    const newCategory = await addCategory(dataAccessClient, name)
    setCategories((current) => [...current, newCategory].sort((a, b) => a.name.localeCompare(b.name)))
    return newCategory.id
  }

  // Reuses the selected Food if the caregiver picked a search result;
  // otherwise the typed name hasn't matched anything, so creates a new Food
  // under the chosen category before logging against it.
  async function resolveFoodId(): Promise<string> {
    if (foodPicker.value) return foodPicker.value.id
    const name = foodPicker.inputValue.trim()
    if (name === '') throw new Error('Choose or enter a food.')
    const categoryId = await resolveCategoryId()
    const newFood = await addFood(dataAccessClient, { categoryId, name })
    setFoods((current) => [...current, newFood].sort((a, b) => a.name.localeCompare(b.name)))
    return newFood.id
  }

  // Adds a new reason tag for the household (ticket 08) and immediately
  // checks it, since a caregiver adding a tag mid-entry almost always means
  // to apply it to the entry they're logging. Reuses a same-name existing
  // tag instead of creating a near-duplicate, same as `resolveCategoryId`.
  async function handleAddReasonTag() {
    const name = newReasonTagInput.trim()
    if (name === '') return
    setReasonTagError(null)
    setAddingReasonTag(true)
    try {
      const existing = findByNameCaseInsensitive(reasonTags, name)
      const tag = existing ?? (await addReasonTag(dataAccessClient, name))
      if (!existing) setReasonTags((current) => [...current, tag].sort((a, b) => a.name.localeCompare(b.name)))
      setEntryReasonTagIds((current) => (current.includes(tag.id) ? current : [...current, tag.id]))
      setNewReasonTagInput('')
    } catch (err) {
      setReasonTagError(err instanceof Error ? err.message : 'Could not add reason tag.')
    } finally {
      setAddingReasonTag(false)
    }
  }

  // Adds up to MAX_PHOTOS_PER_LOG_ENTRY photos total (across however many
  // times the caregiver picks a file), trimming and warning rather than
  // rejecting outright if a single selection would exceed the cap.
  function handlePhotoInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    // Snapshot into a plain array before resetting -- `files` is a live
    // FileList tied to the input, so clearing `value` below empties it too.
    const incoming = files ? Array.from(files) : []
    event.target.value = '' // lets picking the same file again re-trigger onChange
    if (incoming.length === 0) return
    setEntryPhotos((current) => {
      const room = MAX_PHOTOS_PER_LOG_ENTRY - current.length
      setEntryPhotoError(
        incoming.length > room ? `An entry can have at most ${MAX_PHOTOS_PER_LOG_ENTRY} photos.` : null,
      )
      return [...current, ...incoming.slice(0, room)]
    })
  }

  function removePhoto(index: number) {
    setEntryPhotos((current) => current.filter((_, i) => i !== index))
    setEntryPhotoError(null)
  }

  // Resolves the Location to attach to this entry, if any: no captured
  // coordinates or no place name (suggested or manually typed) means logging
  // Shared by `resolveLocationId` and `buildLocationCapture` below: no
  // captured coordinates, or no place name (suggested or manually typed),
  // both mean "log without a place" -- returns undefined either way so both
  // callers can bail out the same way.
  function resolvedLocationName(): string | undefined {
    if (!locationCoords) return undefined
    const name = locationName.trim()
    return name === '' ? undefined : name
  }

  // `findOrCreateLocation` handles reuse -- passing the same mapboxPlaceId
  // again reuses the existing household Location instead of duplicating it.
  async function resolveLocationId(): Promise<string | undefined> {
    const name = resolvedLocationName()
    if (name === undefined || !locationCoords) return undefined
    const location = await findOrCreateLocation(dataAccessClient, {
      name,
      latitude: locationCoords.latitude,
      longitude: locationCoords.longitude,
      mapboxPlaceId: locationMapboxPlaceId,
    })
    return location.id
  }

  // The offline counterpart of `resolveLocationId`: same "no coords or no
  // name means logging without a place" rule (via `resolvedLocationName`),
  // but never calls `findOrCreateLocation` (a Supabase round-trip) -- that's
  // deferred to sync time, once `syncQueuedEntries` actually has a
  // connection to use. Generates its own `id` (rather than leaving it for
  // `findOrCreateLocation` to assign one at sync time) so a retried sync
  // attempt resolves to the same Location row instead of creating a second
  // one -- see `FindOrCreateLocationInput.id`.
  function buildLocationCapture(): QueuedLocationCapture | undefined {
    const name = resolvedLocationName()
    if (name === undefined || !locationCoords) return undefined
    return {
      id: crypto.randomUUID(),
      name,
      latitude: locationCoords.latitude,
      longitude: locationCoords.longitude,
      mapboxPlaceId: locationMapboxPlaceId,
    }
  }

  function resetEntryForm() {
    foodPicker.setValue(null)
    foodPicker.setInputValue('')
    setFoodOptions([])
    setEntryReasonTagIds([])
    setEntryNotes('')
    setEntryIntensity(null)
    setEntryOccurredAt(toDatetimeLocalValue(new Date()))
    setEntryPhotos([])
    setEntryPhotoError(null)
  }

  // Queues an entry locally instead of writing it to Supabase -- the offline
  // path (ticket 11). Only logs against an *existing* Food: creating a new
  // Food/Category (`resolveFoodId`/`resolveCategoryId`) needs its own
  // network round-trip that can't happen offline, so `handleAddEntry` below
  // only calls this once it's confirmed `foodPicker.value` is set. Photos
  // are captured as-is (their bytes, not yet uploaded) and location as raw
  // coordinates/name (not yet resolved to a Location row) -- both finish the
  // rest of the trip through `syncQueuedEntries` once back online.
  async function queueEntryOffline(foodId: string) {
    const queuedEntry: QueuedLogEntry = {
      clientId: crypto.randomUUID(),
      input: {
        foodId,
        childId: entryChildId,
        status: entryStatus,
        reasonTagIds: entryReasonTagIds,
        notes: entryNotes.trim() === '' ? undefined : entryNotes,
        intensity: entryIntensity ?? undefined,
        occurredAt: new Date(entryOccurredAt).toISOString(),
      },
      location: buildLocationCapture(),
      photos: entryPhotos.map((file) => ({ id: crypto.randomUUID(), name: file.name, blob: file })),
    }
    await addQueuedEntry(queuedEntry)
    setQueuedEntries((current) => [queuedEntry, ...current])
  }

  async function handleAddEntry(event: FormEvent) {
    event.preventDefault()
    setEntryError(null)
    setAddingEntry(true)
    try {
      if (!navigator.onLine) {
        if (!foodPicker.value) {
          throw new Error('Choose an existing food to log while offline -- adding a new one needs a connection.')
        }
        await queueEntryOffline(foodPicker.value.id)
        resetEntryForm()
        return
      }

      const foodId = await resolveFoodId()
      const locationId = await resolveLocationId()
      const entry = await addLogEntry(dataAccessClient, {
        foodId,
        childId: entryChildId,
        status: entryStatus,
        reasonTagIds: entryReasonTagIds,
        notes: entryNotes.trim() === '' ? undefined : entryNotes,
        intensity: entryIntensity ?? undefined,
        occurredAt: new Date(entryOccurredAt).toISOString(),
        locationId,
      })
      setEntries((current) => [entry, ...current])

      // Uploaded as a follow-up step once the entry exists (photos attach
      // to a log_entry_id) -- the entry itself is kept even if a photo
      // upload fails, rather than rolling the whole submission back.
      if (entryPhotos.length > 0) {
        const uploads = await Promise.allSettled(
          entryPhotos.map((file) => addLogEntryPhoto(dataAccessClient, entry.id, file)),
        )
        const failedCount = uploads.filter((result) => result.status === 'rejected').length
        if (failedCount > 0) {
          setEntryError(`Entry logged, but ${failedCount} photo(s) failed to upload.`)
        }
      }

      resetEntryForm()
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : 'Could not add log entry.')
    } finally {
      setAddingEntry(false)
    }
  }

  function openEditDialog(entry: LogEntry) {
    setEditingEntry(entry)
    setEditStatus(entry.status)
    setEditReasonTagIds(entry.reasonTagIds)
    setEditNotes(entry.notes ?? '')
    setEditError(null)
  }

  function closeEditDialog() {
    if (editSaving) return
    setEditingEntry(null)
  }

  function toggleEditReasonTag(id: string) {
    setEditReasonTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    )
  }

  async function handleSaveEdit() {
    if (!editingEntry) return
    setEditError(null)
    setEditSaving(true)
    try {
      const updated = await updateLogEntry(dataAccessClient, editingEntry.id, {
        status: editStatus,
        reasonTagIds: editReasonTagIds,
        notes: editNotes.trim() === '' ? null : editNotes,
      })
      setEntries((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      setEditingEntry(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setEditSaving(false)
    }
  }

  function openDeleteDialog(entry: LogEntry) {
    setDeletingEntry(entry)
    setDeleteError(null)
  }

  function closeDeleteDialog() {
    if (deleting) return
    setDeletingEntry(null)
  }

  async function handleConfirmDelete() {
    if (!deletingEntry) return
    setDeleteError(null)
    setDeleting(true)
    try {
      await deleteLogEntry(dataAccessClient, deletingEntry.id)
      setEntries((current) => current.filter((entry) => entry.id !== deletingEntry.id))
      setDeletingEntry(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete entry.')
    } finally {
      setDeleting(false)
    }
  }

  // Opens the single-entry detail view and fetches its photos fresh (rather
  // than in the load-time useEffect) so the signed URLs are as new as
  // possible when they're actually rendered -- see the note on
  // `viewingPhotoUrls` above. Guards against a rapid A-then-B click on two
  // different entries the same way the load-time/geolocation/food-search
  // effects guard with a `cancelled` flag: without it, entry A's slower
  // fetch could resolve after B's dialog is already open and clobber B's
  // photos with A's.
  function openDetailDialog(entry: LogEntry) {
    const requestId = ++viewingRequestIdRef.current
    setViewingEntry(entry)
    setViewingPhotos([])
    setViewingPhotoUrls({})
    setViewingPhotosError(null)
    setLightboxPath(null)
    setViewingPhotosLoading(true)
    listLogEntryPhotos(dataAccessClient, entry.id)
      .then(async (photos) => {
        const sorted = sortLogEntryPhotos(photos)
        const urls = await Promise.all(sorted.map((photo) => getLogEntryPhotoUrl(dataAccessClient, photo.path)))
        if (viewingRequestIdRef.current !== requestId) return
        setViewingPhotos(sorted)
        setViewingPhotoUrls(Object.fromEntries(sorted.map((photo, index) => [photo.path, urls[index]])))
      })
      .catch((err) => {
        if (viewingRequestIdRef.current !== requestId) return
        setViewingPhotosError(err instanceof Error ? err.message : 'Could not load photos.')
      })
      .finally(() => {
        if (viewingRequestIdRef.current !== requestId) return
        setViewingPhotosLoading(false)
      })
  }

  function closeDetailDialog() {
    setViewingEntry(null)
    setLightboxPath(null)
  }

  function nameById(list: { id: string; name: string }[], id: string): string {
    return list.find((item) => item.id === id)?.name ?? 'Unknown'
  }

  function reasonTagNames(ids: string[]): string {
    return ids.map((id) => nameById(reasonTags, id)).join(', ')
  }

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
      {children.length === 0 ? (
        <Typography color="text.secondary">Add a child before logging an entry.</Typography>
      ) : (
        <Stack component="form" onSubmit={handleAddEntry} spacing={2} noValidate sx={{ mb: 3 }}>
          <Autocomplete
            freeSolo
            filterOptions={(options) => options}
            options={foodOptions}
            loading={foodSearchLoading}
            {...foodPicker.autocompleteProps}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Food"
                required
                helperText="Search for an existing food, or type a new brand/product name."
              />
            )}
          />
          {!foodPicker.value && foodPicker.inputValue.trim() !== '' && (
            <Autocomplete
              freeSolo
              options={categories}
              {...categoryPicker.autocompleteProps}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="New food's category"
                  required
                  helperText="Pick an existing category, or type a new one to add it for the household."
                />
              )}
            />
          )}
          <FormControl required fullWidth>
            <InputLabel id="entry-child-label">Child</InputLabel>
            <Select
              labelId="entry-child-label"
              label="Child"
              value={entryChildId}
              onChange={(event) => setEntryChildId(event.target.value)}
              displayEmpty
            >
              <MenuItem value="" disabled>
                Choose a child
              </MenuItem>
              {children.map((child) => (
                <MenuItem key={child.id} value={child.id}>
                  {child.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Date happened"
            type="datetime-local"
            value={entryOccurredAt}
            onChange={(event) => setEntryOccurredAt(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            helperText="Defaults to now -- change it to log something that happened earlier."
            fullWidth
          />

          <FormControl component="fieldset">
            <FormLabel component="legend">Status</FormLabel>
            <RadioGroup
              row
              value={entryStatus}
              onChange={(event) => setEntryStatus(event.target.value as LogEntryStatus)}
            >
              {STATUSES.map((status) => (
                <FormControlLabel key={status} value={status} control={<Radio />} label={statusLabel(status)} />
              ))}
            </RadioGroup>
          </FormControl>

          <FormControl component="fieldset">
            <FormLabel component="legend">Intensity (optional)</FormLabel>
            <Rating
              value={entryIntensity}
              onChange={(_event, newValue) => setEntryIntensity(newValue)}
              max={5}
            />
          </FormControl>

          <FormControl component="fieldset">
            <FormLabel component="legend">Reasons</FormLabel>
            <FormGroup row>
              {reasonTags.map((tag) => (
                <FormControlLabel
                  key={tag.id}
                  control={
                    <Checkbox checked={entryReasonTagIds.includes(tag.id)} onChange={() => toggleReasonTag(tag.id)} />
                  }
                  label={tag.name}
                />
              ))}
            </FormGroup>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
              <TextField
                size="small"
                label="Add a reason tag"
                value={newReasonTagInput}
                onChange={(event) => setNewReasonTagInput(event.target.value)}
                helperText="Adds a new reason tag for the whole household."
              />
              <Button
                size="small"
                variant="outlined"
                disabled={newReasonTagInput.trim() === '' || addingReasonTag}
                onClick={handleAddReasonTag}
              >
                {addingReasonTag ? 'Adding…' : 'Add'}
              </Button>
            </Stack>
            {reasonTagError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {reasonTagError}
              </Alert>
            )}
          </FormControl>

          <TextField
            label="Notes"
            value={entryNotes}
            onChange={(event) => setEntryNotes(event.target.value)}
            multiline
            minRows={2}
            fullWidth
            // Inconsistent reactions are the case most worth a note (what
            // was inconsistent about it?), but it's still optional -- the
            // field itself is unchanged, just nudged via helper text.
            helperText={
              entryStatus === 'inconsistent' ? "What made this inconsistent? (optional)" : undefined
            }
          />

          {locationStatus === 'locating' && (
            <Typography variant="body2" color="text.secondary">
              Getting your location…
            </Typography>
          )}
          {locationStatus === 'unavailable' && (
            <Typography variant="body2" color="text.secondary">
              Location unavailable -- this entry will be logged without a place.
            </Typography>
          )}
          {(locationStatus === 'geocoding' || locationStatus === 'ready') && (
            <TextField
              label="Place"
              value={locationName}
              onChange={(event) => {
                setLocationName(event.target.value)
                // Editing the suggested name means it's no longer that
                // Mapbox place's confirmed name -- clear the id so
                // `resolveLocationId`/`buildLocationCapture` treat this as a
                // custom capture (a new Location) instead of reusing (and
                // silently discarding the edit for) whatever's already saved
                // under the original suggestion's mapboxPlaceId.
                setLocationMapboxPlaceId(null)
              }}
              fullWidth
              slotProps={
                locationStatus === 'geocoding'
                  ? { input: { endAdornment: <CircularProgress size={16} /> } }
                  : undefined
              }
              helperText={
                locationStatus === 'geocoding'
                  ? 'Looking up a name for this place…'
                  : locationMapboxPlaceId
                    ? 'Suggested from your location -- edit if this is wrong, or clear it to log without a place.'
                    : "Couldn't suggest a name -- enter one, or leave blank to log without a place."
              }
            />
          )}

          <Box>
            <FormLabel component="legend">Photos (up to {MAX_PHOTOS_PER_LOG_ENTRY})</FormLabel>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
              {entryPhotos.map((file, index) => (
                <Chip key={`${file.name}-${index}`} label={file.name} onDelete={() => removePhoto(index)} />
              ))}
              {entryPhotos.length < MAX_PHOTOS_PER_LOG_ENTRY && (
                <Button component="label" size="small" variant="outlined">
                  Add photo
                  <input type="file" accept="image/*" hidden multiple onChange={handlePhotoInputChange} />
                </Button>
              )}
            </Stack>
            {entryPhotoError && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {entryPhotoError}
              </Alert>
            )}
          </Box>

          {entryError && <Alert severity="error">{entryError}</Alert>}
          <Button
            type="submit"
            variant="contained"
            disabled={
              addingEntry ||
              entryChildId === '' ||
              entryReasonTagIds.length === 0 ||
              foodPicker.inputValue.trim() === '' ||
              (!foodPicker.value && !categoryPicker.value && categoryPicker.inputValue.trim() === '')
            }
          >
            {addingEntry ? 'Logging…' : 'Log entry'}
          </Button>
        </Stack>
      )}

      {queuedEntries.length > 0 && (
        <>
          <Typography variant="h6" component="h2" gutterBottom>
            Queued (offline)
          </Typography>
          <List sx={{ bgcolor: 'background.paper', borderRadius: 1, mb: 3 }}>
            {queuedEntries.map((queuedEntry) => (
              <ListItem key={queuedEntry.clientId} alignItems="flex-start">
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography component="span" sx={{ fontWeight: 500 }}>
                        {nameById(children, queuedEntry.input.childId)} —{' '}
                        {nameById(foods, queuedEntry.input.foodId)}
                      </Typography>
                      <Chip size="small" color="warning" label="Queued — will sync when back online" />
                    </Stack>
                  }
                  secondary={
                    <>
                      {new Date(queuedEntry.input.occurredAt ?? new Date().toISOString()).toLocaleString()} —{' '}
                      {reasonTagNames(queuedEntry.input.reasonTagIds)}
                      {queuedEntry.photos.length > 0
                        ? ` — ${queuedEntry.photos.length} photo(s) pending upload`
                        : ''}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </>
      )}

      <Divider sx={{ mb: 3 }} />

      <Typography variant="h6" component="h2" gutterBottom>
        Recent entries
      </Typography>
      <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
        {entries.length === 0 && (
          <ListItem>
            <ListItemText primary="No entries yet." />
          </ListItem>
        )}
        {entries.map((entry) => (
          <ListItem
            key={entry.id}
            alignItems="flex-start"
            disablePadding
            secondaryAction={
              <Stack direction="row" spacing={0.5}>
                <IconButton edge="end" aria-label="Edit entry" onClick={() => openEditDialog(entry)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton edge="end" aria-label="Delete entry" onClick={() => openDeleteDialog(entry)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            }
          >
            <ListItemButton
              alignItems="flex-start"
              onClick={() => openDetailDialog(entry)}
              sx={{ pr: 10 }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography component="span" sx={{ fontWeight: 500 }}>
                      {nameById(children, entry.childId)} — {nameById(foods, entry.foodId)}
                    </Typography>
                    <Chip size="small" label={statusLabel(entry.status)} />
                    {entry.intensity !== null && <Rating size="small" value={entry.intensity} max={5} readOnly />}
                    {entryIdsWithPhotos.has(entry.id) && (
                      <PhotoCameraIcon fontSize="small" color="action" titleAccess="Has photos" />
                    )}
                  </Stack>
                }
                secondary={
                  <>
                    {new Date(entry.occurredAt).toLocaleString()} — {reasonTagNames(entry.reasonTagIds)}
                    {entry.notes ? ` — "${entry.notes}"` : ''}
                  </>
                }
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Dialog open={editingEntry !== null} onClose={closeEditDialog} fullWidth maxWidth="sm">
        <DialogTitle>Edit entry</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl component="fieldset">
              <FormLabel component="legend">Status</FormLabel>
              <RadioGroup row value={editStatus} onChange={(event) => setEditStatus(event.target.value as LogEntryStatus)}>
                {STATUSES.map((status) => (
                  <FormControlLabel key={status} value={status} control={<Radio />} label={statusLabel(status)} />
                ))}
              </RadioGroup>
            </FormControl>

            <FormControl component="fieldset">
              <FormLabel component="legend">Reasons</FormLabel>
              <FormGroup row>
                {reasonTags.map((tag) => (
                  <FormControlLabel
                    key={tag.id}
                    control={
                      <Checkbox checked={editReasonTagIds.includes(tag.id)} onChange={() => toggleEditReasonTag(tag.id)} />
                    }
                    label={tag.name}
                  />
                ))}
              </FormGroup>
            </FormControl>

            <TextField
              label="Notes"
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
              multiline
              minRows={2}
              fullWidth
            />

            {editError && <Alert severity="error">{editError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditDialog} disabled={editSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEdit}
            disabled={editSaving || editReasonTagIds.length === 0}
          >
            {editSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deletingEntry !== null} onClose={closeDeleteDialog}>
        <DialogTitle>Delete entry?</DialogTitle>
        <DialogContent>
          <Typography>
            This removes the entry for{' '}
            {deletingEntry ? `${nameById(children, deletingEntry.childId)} — ${nameById(foods, deletingEntry.foodId)}` : ''}{' '}
            permanently. This can't be undone.
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleConfirmDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={viewingEntry !== null} onClose={closeDetailDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {viewingEntry ? `${nameById(children, viewingEntry.childId)} — ${nameById(foods, viewingEntry.foodId)}` : ''}
          <IconButton aria-label="Close" onClick={closeDetailDialog} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {viewingEntry && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip size="small" label={statusLabel(viewingEntry.status)} />
                {viewingEntry.intensity !== null && (
                  <Rating size="small" value={viewingEntry.intensity} max={5} readOnly />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {new Date(viewingEntry.occurredAt).toLocaleString()}
              </Typography>
              <Typography variant="body2">Reasons: {reasonTagNames(viewingEntry.reasonTagIds)}</Typography>
              {viewingEntry.notes && <Typography variant="body2">"{viewingEntry.notes}"</Typography>}

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Photos
                </Typography>
                {viewingPhotosLoading && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                )}
                {viewingPhotosError && <Alert severity="error">{viewingPhotosError}</Alert>}
                {!viewingPhotosLoading && !viewingPhotosError && viewingPhotos.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No photos attached to this entry.
                  </Typography>
                )}
                {!viewingPhotosLoading && !viewingPhotosError && viewingPhotos.length > 0 && (
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {viewingPhotos.map((photo) => (
                      <Box
                        key={photo.path}
                        component="button"
                        type="button"
                        onClick={() => setLightboxPath(photo.path)}
                        aria-label={`View ${photo.name} full size`}
                        sx={{
                          p: 0,
                          border: 'none',
                          borderRadius: 1,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          bgcolor: 'transparent',
                          lineHeight: 0,
                        }}
                      >
                        <Box
                          component="img"
                          src={viewingPhotoUrls[photo.path]}
                          alt={photo.name}
                          sx={{ width: 96, height: 96, objectFit: 'cover', display: 'block' }}
                        />
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={lightboxPath !== null} onClose={() => setLightboxPath(null)} maxWidth="lg">
        <DialogContent
          sx={{ p: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'common.black' }}
        >
          {lightboxPath && (
            <Box
              component="img"
              src={viewingPhotoUrls[lightboxPath]}
              alt=""
              sx={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" component="h2" gutterBottom>
        All foods
      </Typography>
      <List dense sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
        {foods.length === 0 && (
          <ListItem>
            <ListItemText primary="No foods yet." />
          </ListItem>
        )}
        {foods.map((food) => (
          <ListItem key={food.id}>
            <ListItemText primary={food.name} secondary={nameById(categories, food.categoryId)} />
          </ListItem>
        ))}
      </List>
    </AppLayout>
  )
}
