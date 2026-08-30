import {
  addCategory,
  addFood,
  addLogEntry,
  addLogEntryPhoto,
  addReasonTag,
  MAX_PHOTOS_PER_LOG_ENTRY,
  searchFoods,
  type Category,
  type Child,
  type Food,
  type LogEntry,
  type LogEntryStatus,
  type QueuedLogEntry,
  type ReasonTag,
} from '@food-tracker/data-access'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  InputLabel,
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
import { dataAccessClient } from '../../lib/dataAccessClient'
import { addQueuedEntry } from '../../lib/offlineQueueStore'
import { findByNameCaseInsensitive, statusLabel, STATUSES, toDatetimeLocalValue } from '../../lib/entryFormatting'
import { LocationField } from './LocationField'
import { useFreeSoloPicker } from './useFreeSoloPicker'
import { useLocationCapture } from './useLocationCapture'

const FOOD_SEARCH_DEBOUNCE_MS = 250

/** The "Log an entry" form (tickets 06/07/08/09/10/11/17/20/21/28). Owns all
 * of its own draft state -- food/category pickers, child, date, status,
 * intensity, reasons, notes, photos, and (via `useLocationCapture`) the
 * opt-in place -- and both submit paths (online write vs. offline queue). It
 * reports mutations of shared household data (a new entry, a queued entry, a
 * newly-created food/category/reason tag) up to the coordinator via callbacks
 * so the surrounding lists stay in sync. */
export function AddEntryForm({
  childProfiles,
  foods,
  categories,
  reasonTags,
  isOnline,
  onEntryAdded,
  onEntryQueued,
  onFoodAdded,
  onCategoryAdded,
  onReasonTagAdded,
}: {
  childProfiles: Child[]
  foods: Food[]
  categories: Category[]
  reasonTags: ReasonTag[]
  isOnline: boolean
  onEntryAdded: (entry: LogEntry) => void
  onEntryQueued: (queuedEntry: QueuedLogEntry) => void
  onFoodAdded: (food: Food) => void
  onCategoryAdded: (category: Category) => void
  onReasonTagAdded: (tag: ReasonTag) => void
}) {
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

  const location = useLocationCapture(isOnline)

  // Seed the category picker with the household's first category once
  // categories have loaded (matching the original load-time default), but
  // only once -- so clearing it later doesn't get re-seeded on a re-render.
  const seededDefaultCategoryRef = useRef(false)
  useEffect(() => {
    if (seededDefaultCategoryRef.current || categories.length === 0) return
    seededDefaultCategoryRef.current = true
    setDefaultCategory(categories[0])
    setDefaultCategoryInputValue(categories[0].name)
  }, [categories, setDefaultCategory, setDefaultCategoryInputValue])

  // Searches existing household Foods as the caregiver types, so they can
  // reuse a match instead of creating a duplicate. Skipped once a food has
  // been selected and the input still reflects its name.
  //
  // Offline, the food picker is a plain dropdown of the already-loaded `foods`
  // (ticket 25), not this typeahead -- so there's no query to run and no
  // network round-trip to make (ticket 11 only allows logging against an
  // existing food offline anyway). Bail out before `searchFoods` so a stale
  // keystroke can't fire a request while offline.
  useEffect(() => {
    if (!isOnline) {
      setFoodOptions([])
      setFoodSearchLoading(false)
      return
    }
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
  }, [foodPicker.inputValue, foodPicker.value, isOnline])

  function toggleReasonTag(id: string) {
    setEntryReasonTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    )
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
    onCategoryAdded(newCategory)
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
    onFoodAdded(newFood)
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
      if (!existing) onReasonTagAdded(tag)
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
      setEntryPhotoError(incoming.length > room ? `An entry can have at most ${MAX_PHOTOS_PER_LOG_ENTRY} photos.` : null)
      return [...current, ...incoming.slice(0, room)]
    })
  }

  function removePhoto(index: number) {
    setEntryPhotos((current) => current.filter((_, i) => i !== index))
    setEntryPhotoError(null)
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
      location: location.buildLocationCapture(),
      photos: entryPhotos.map((file) => ({ id: crypto.randomUUID(), name: file.name, blob: file })),
    }
    await addQueuedEntry(queuedEntry)
    onEntryQueued(queuedEntry)
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
      const locationId = await location.resolveLocationId()
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
      onEntryAdded(entry)

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

  if (childProfiles.length === 0) {
    return <Typography color="text.secondary">Add a child before logging an entry.</Typography>
  }

  return (
    <Stack component="form" onSubmit={handleAddEntry} spacing={2} noValidate sx={{ mb: 3 }}>
      {isOnline ? (
        <>
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
        </>
      ) : (
        // Offline (ticket 25): a plain dropdown of already-loaded foods --
        // an honest affordance for an in-memory list, unlike a typeahead
        // that implies a live search. Adding a new food needs a
        // connection, so only existing foods are offered here.
        <FormControl required fullWidth>
          <InputLabel id="offline-food-label">Food</InputLabel>
          <Select
            labelId="offline-food-label"
            label="Food"
            value={foodPicker.value?.id ?? ''}
            onChange={(event) => {
              const food = foods.find((option) => option.id === event.target.value) ?? null
              foodPicker.setValue(food)
              foodPicker.setInputValue(food?.name ?? '')
            }}
            displayEmpty
          >
            {foods.map((food) => (
              <MenuItem key={food.id} value={food.id}>
                {food.name}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>Offline -- pick an existing food. Adding a new food needs a connection.</FormHelperText>
        </FormControl>
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
          {childProfiles.map((child) => (
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
        <RadioGroup row value={entryStatus} onChange={(event) => setEntryStatus(event.target.value as LogEntryStatus)}>
          {STATUSES.map((status) => (
            <FormControlLabel key={status} value={status} control={<Radio />} label={statusLabel(status)} />
          ))}
        </RadioGroup>
      </FormControl>

      <FormControl component="fieldset">
        <FormLabel component="legend">Intensity (optional)</FormLabel>
        <Rating value={entryIntensity} onChange={(_event, newValue) => setEntryIntensity(newValue)} max={5} />
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
        helperText={entryStatus === 'inconsistent' ? 'What made this inconsistent? (optional)' : undefined}
      />

      <LocationField capture={location} />

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
  )
}
