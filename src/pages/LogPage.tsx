import {
  addFood,
  addLogEntry,
  listCategories,
  listChildren,
  listFoods,
  listLogEntries,
  listReasonTags,
  type Category,
  type Child,
  type Food,
  type LogEntry,
  type LogEntryStatus,
  type ReasonTag,
} from '@food-tracker/data-access'
import {
  Alert,
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

  const [foodCategoryId, setFoodCategoryId] = useState('')
  const [foodName, setFoodName] = useState('')
  const [foodError, setFoodError] = useState<string | null>(null)
  const [addingFood, setAddingFood] = useState(false)

  const [entryFoodId, setEntryFoodId] = useState('')
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
        if (categoriesResult.length > 0) setFoodCategoryId(categoriesResult[0].id)
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

  async function handleAddFood(event: FormEvent) {
    event.preventDefault()
    setFoodError(null)
    setAddingFood(true)
    try {
      const food = await addFood(dataAccessClient, { categoryId: foodCategoryId, name: foodName })
      setFoods((current) => [...current, food].sort((a, b) => a.name.localeCompare(b.name)))
      setEntryFoodId(food.id)
      setFoodName('')
    } catch (err) {
      setFoodError(err instanceof Error ? err.message : 'Could not add food.')
    } finally {
      setAddingFood(false)
    }
  }

  function toggleReasonTag(id: string) {
    setEntryReasonTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    )
  }

  async function handleAddEntry(event: FormEvent) {
    event.preventDefault()
    setEntryError(null)
    setAddingEntry(true)
    try {
      const entry = await addLogEntry(dataAccessClient, {
        foodId: entryFoodId,
        childId: entryChildId,
        status: entryStatus,
        reasonTagIds: entryReasonTagIds,
        notes: entryNotes.trim() === '' ? undefined : entryNotes,
      })
      setEntries((current) => [entry, ...current])
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
        Add a food
      </Typography>
      <Stack component="form" onSubmit={handleAddFood} spacing={2} noValidate sx={{ mb: 2 }}>
        <FormControl required fullWidth>
          <InputLabel id="food-category-label">Category</InputLabel>
          <Select
            labelId="food-category-label"
            label="Category"
            value={foodCategoryId}
            onChange={(event) => setFoodCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Brand/product name"
          value={foodName}
          onChange={(event) => setFoodName(event.target.value)}
          required
          fullWidth
        />
        {foodError && <Alert severity="error">{foodError}</Alert>}
        <Button type="submit" variant="contained" disabled={addingFood || categories.length === 0}>
          {addingFood ? 'Adding…' : 'Add food'}
        </Button>
      </Stack>

      <List dense sx={{ bgcolor: 'background.paper', borderRadius: 1, mb: 3 }}>
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

      <Divider sx={{ mb: 3 }} />

      <Typography variant="h6" component="h2" gutterBottom>
        Log an entry
      </Typography>
      {foods.length === 0 || children.length === 0 ? (
        <Typography color="text.secondary">Add a food and a child before logging an entry.</Typography>
      ) : (
        <Stack component="form" onSubmit={handleAddEntry} spacing={2} noValidate sx={{ mb: 3 }}>
          <FormControl required fullWidth>
            <InputLabel id="entry-food-label">Food</InputLabel>
            <Select
              labelId="entry-food-label"
              label="Food"
              value={entryFoodId}
              onChange={(event) => setEntryFoodId(event.target.value)}
              displayEmpty
            >
              <MenuItem value="" disabled>
                Choose a food
              </MenuItem>
              {foods.map((food) => (
                <MenuItem key={food.id} value={food.id}>
                  {food.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
          <Button type="submit" variant="contained" disabled={addingEntry || entryReasonTagIds.length === 0}>
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
    </AppLayout>
  )
}
