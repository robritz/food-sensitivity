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
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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

  if (loading) return <p>Loading…</p>
  if (loadError) return <p role="alert">{loadError}</p>

  return (
    <main>
      <h1>Food log</h1>

      <h2>Add a food</h2>
      <form onSubmit={handleAddFood}>
        <label>
          Category
          <select value={foodCategoryId} onChange={(event) => setFoodCategoryId(event.target.value)} required>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Brand/product name
          <input type="text" value={foodName} onChange={(event) => setFoodName(event.target.value)} required />
        </label>
        {foodError && <p role="alert">{foodError}</p>}
        <button type="submit" disabled={addingFood || categories.length === 0}>
          {addingFood ? 'Adding…' : 'Add food'}
        </button>
      </form>

      <ul>
        {foods.length === 0 && <li>No foods yet.</li>}
        {foods.map((food) => (
          <li key={food.id}>
            {food.name} — {nameById(categories, food.categoryId)}
          </li>
        ))}
      </ul>

      <h2>Log an entry</h2>
      {foods.length === 0 || children.length === 0 ? (
        <p>Add a food and a child before logging an entry.</p>
      ) : (
        <form onSubmit={handleAddEntry}>
          <label>
            Food
            <select value={entryFoodId} onChange={(event) => setEntryFoodId(event.target.value)} required>
              <option value="" disabled>
                Choose a food
              </option>
              {foods.map((food) => (
                <option key={food.id} value={food.id}>
                  {food.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Child
            <select value={entryChildId} onChange={(event) => setEntryChildId(event.target.value)} required>
              <option value="" disabled>
                Choose a child
              </option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>Status</legend>
            {STATUSES.map((status) => (
              <label key={status}>
                <input
                  type="radio"
                  name="status"
                  value={status}
                  checked={entryStatus === status}
                  onChange={() => setEntryStatus(status)}
                />
                {statusLabel(status)}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Reasons</legend>
            {reasonTags.map((tag) => (
              <label key={tag.id}>
                <input
                  type="checkbox"
                  checked={entryReasonTagIds.includes(tag.id)}
                  onChange={() => toggleReasonTag(tag.id)}
                />
                {tag.name}
              </label>
            ))}
          </fieldset>

          <label>
            Notes
            <textarea value={entryNotes} onChange={(event) => setEntryNotes(event.target.value)} />
          </label>

          {entryError && <p role="alert">{entryError}</p>}
          <button type="submit" disabled={addingEntry || entryReasonTagIds.length === 0}>
            {addingEntry ? 'Logging…' : 'Log entry'}
          </button>
        </form>
      )}

      <h2>Recent entries</h2>
      <ul>
        {entries.length === 0 && <li>No entries yet.</li>}
        {entries.map((entry) => (
          <li key={entry.id}>
            {nameById(children, entry.childId)} — {nameById(foods, entry.foodId)} — {statusLabel(entry.status)} (
            {reasonTagNames(entry.reasonTagIds)}){entry.notes ? ` — "${entry.notes}"` : ''}
          </li>
        ))}
      </ul>

      <p>
        <Link to="/">Back home</Link>
      </p>
    </main>
  )
}
