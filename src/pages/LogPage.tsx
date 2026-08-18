import {
  addFood,
  addLogEntry,
  listCategories,
  listChildren,
  listFoods,
  listLogEntries,
  listReasonTags,
  searchFoods,
  type Category,
  type Child,
  type Food,
  type LogEntry,
  type LogEntryStatus,
  type ReasonTag,
} from '@food-tracker/data-access'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useState, type FormEvent } from 'react'
import { AppLayout } from '../components/AppLayout'
import { dataAccessClient } from '../lib/dataAccessClient'

const FOOD_SEARCH_DEBOUNCE_MS = 250

const STATUSES: LogEntryStatus[] = ['liked', 'disliked', 'inconsistent']

function statusLabel(status: LogEntryStatus): string {
  return status[0].toUpperCase() + status.slice(1)
}

export function LogPage() {
  const [children, setChildren] = useState<Child[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [reasonTags, setReasonTags] = useState<ReasonTag[]>([])
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [newFoodCategoryId, setNewFoodCategoryId] = useState('')

  const [foodInputValue, setFoodInputValue] = useState('')
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [foodOptions, setFoodOptions] = useState<Food[]>([])
  const [foodSearchLoading, setFoodSearchLoading] = useState(false)

  const [entryChildId, setEntryChildId] = useState('')
  const [entryStatus, setEntryStatus] = useState<LogEntryStatus>('liked')
  const [entryReasonTagIds, setEntryReasonTagIds] = useState<string[]>([])
  const [entryNotes, setEntryNotes] = useState('')
  const [entryError, setEntryError] = useState<string | null>(null)
  const [addingEntry, setAddingEntry] = useState(false)

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
        if (categoriesResult.length > 0) setNewFoodCategoryId(categoriesResult[0].id)
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

  // Searches existing household Foods as the caregiver types, so they can
  // reuse a match instead of creating a duplicate. Skipped once a food has
  // been selected and the input still reflects its name.
  useEffect(() => {
    const query = foodInputValue.trim()
    if (selectedFood && selectedFood.name === foodInputValue) return
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
  }, [foodInputValue, selectedFood])

  function toggleReasonTag(id: string) {
    setEntryReasonTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    )
  }

  // Reuses the selected Food if the caregiver picked a search result;
  // otherwise the typed name hasn't matched anything, so creates a new Food
  // under the chosen category before logging against it.
  async function resolveFoodId(): Promise<string> {
    if (selectedFood) return selectedFood.id
    const name = foodInputValue.trim()
    if (name === '') throw new Error('Choose or enter a food.')
    const newFood = await addFood(dataAccessClient, { categoryId: newFoodCategoryId, name })
    setFoods((current) => [...current, newFood].sort((a, b) => a.name.localeCompare(b.name)))
    return newFood.id
  }

  async function handleAddEntry(event: FormEvent) {
    event.preventDefault()
    setEntryError(null)
    setAddingEntry(true)
    try {
      const foodId = await resolveFoodId()
      const entry = await addLogEntry(dataAccessClient, {
        foodId,
        childId: entryChildId,
        status: entryStatus,
        reasonTagIds: entryReasonTagIds,
        notes: entryNotes.trim() === '' ? undefined : entryNotes,
      })
      setEntries((current) => [entry, ...current])
      setSelectedFood(null)
      setFoodInputValue('')
      setFoodOptions([])
      setEntryReasonTagIds([])
      setEntryNotes('')
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : 'Could not add log entry.')
    } finally {
      setAddingEntry(false)
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
            value={selectedFood}
            inputValue={foodInputValue}
            getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
            isOptionEqualToValue={(option, value) =>
              typeof option !== 'string' && typeof value !== 'string' && option.id === value.id
            }
            onInputChange={(_event, newInputValue, reason) => {
              setFoodInputValue(newInputValue)
              if (reason === 'input') setSelectedFood(null)
            }}
            onChange={(_event, newValue) => {
              setSelectedFood(newValue && typeof newValue !== 'string' ? newValue : null)
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Food"
                required
                helperText="Search for an existing food, or type a new brand/product name."
              />
            )}
          />
          {!selectedFood && foodInputValue.trim() !== '' && (
            <FormControl required fullWidth>
              <InputLabel id="new-food-category-label">New food's category</InputLabel>
              <Select
                labelId="new-food-category-label"
                label="New food's category"
                value={newFoodCategoryId}
                onChange={(event) => setNewFoodCategoryId(event.target.value)}
              >
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
              </Select>
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
          </FormControl>

          <TextField
            label="Notes"
            value={entryNotes}
            onChange={(event) => setEntryNotes(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          {entryError && <Alert severity="error">{entryError}</Alert>}
          <Button
            type="submit"
            variant="contained"
            disabled={
              addingEntry ||
              entryReasonTagIds.length === 0 ||
              foodInputValue.trim() === '' ||
              (!selectedFood && newFoodCategoryId === '')
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
          <ListItem key={entry.id} alignItems="flex-start">
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography component="span" sx={{ fontWeight: 500 }}>
                    {nameById(children, entry.childId)} — {nameById(foods, entry.foodId)}
                  </Typography>
                  <Chip size="small" label={statusLabel(entry.status)} />
                </Stack>
              }
              secondary={
                <>
                  {reasonTagNames(entry.reasonTagIds)}
                  {entry.notes ? ` — "${entry.notes}"` : ''}
                </>
              }
            />
          </ListItem>
        ))}
      </List>

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
