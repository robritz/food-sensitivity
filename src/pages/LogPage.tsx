import {
  addCategory,
  addFood,
  addLogEntry,
  addLogEntryPhoto,
  addReasonTag,
  deleteLogEntry,
  findOrCreateLocation,
  listCategories,
  listChildren,
  listFoods,
  listLogEntries,
  listReasonTags,
  MAX_PHOTOS_PER_LOG_ENTRY,
  reverseGeocode,
  searchFoods,
  updateLogEntry,
  type Category,
  type Child,
  type Food,
  type LogEntry,
  type LogEntryStatus,
  type ReasonTag,
} from '@food-tracker/data-access'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
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
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { AppLayout } from '../components/AppLayout'
import { dataAccessClient } from '../lib/dataAccessClient'

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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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
  useEffect(() => {
    const query = foodPicker.inputValue.trim()
    if (foodPicker.value && foodPicker.value.name === foodPicker.inputValue) return
    if (query === '') {
      setFoodOptions([])
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
  }, [foodPicker.inputValue, foodPicker.value])

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
    event.target.value = '' // lets picking the same file again re-trigger onChange
    if (!files || files.length === 0) return
    const incoming = Array.from(files)
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
  // without a place, same as a caregiver who denied location permission.
  // `findOrCreateLocation` handles reuse -- passing the same mapboxPlaceId
  // again reuses the existing household Location instead of duplicating it.
  async function resolveLocationId(): Promise<string | undefined> {
    if (!locationCoords) return undefined
    const name = locationName.trim()
    if (name === '') return undefined
    const location = await findOrCreateLocation(dataAccessClient, {
      name,
      latitude: locationCoords.latitude,
      longitude: locationCoords.longitude,
      mapboxPlaceId: locationMapboxPlaceId,
    })
    return location.id
  }

  async function handleAddEntry(event: FormEvent) {
    event.preventDefault()
    setEntryError(null)
    setAddingEntry(true)
    try {
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

      foodPicker.setValue(null)
      foodPicker.setInputValue('')
      setFoodOptions([])
      setEntryReasonTagIds([])
      setEntryNotes('')
      setEntryIntensity(null)
      setEntryOccurredAt(toDatetimeLocalValue(new Date()))
      setEntryPhotos([])
      setEntryPhotoError(null)
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
              onChange={(event) => setLocationName(event.target.value)}
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
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography component="span" sx={{ fontWeight: 500 }}>
                    {nameById(children, entry.childId)} — {nameById(foods, entry.foodId)}
                  </Typography>
                  <Chip size="small" label={statusLabel(entry.status)} />
                  {entry.intensity !== null && <Rating size="small" value={entry.intensity} max={5} readOnly />}
                </Stack>
              }
              secondary={
                <>
                  {new Date(entry.occurredAt).toLocaleString()} — {reasonTagNames(entry.reasonTagIds)}
                  {entry.notes ? ` — "${entry.notes}"` : ''}
                </>
              }
            />
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
