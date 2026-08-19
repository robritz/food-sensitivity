import {
  listChildren,
  listFoodStatusSummary,
  listFoods,
  listLogEntries,
  listReasonTags,
  type Child,
  type Food,
  type FoodStatusSummary,
  type LogEntry,
  type LogEntryStatus,
  type ReasonTag,
} from '@food-tracker/data-access'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useEffect, useState } from 'react'
import { AppLayout } from '../components/AppLayout'
import { dataAccessClient } from '../lib/dataAccessClient'

function statusLabel(status: LogEntryStatus): string {
  return status[0].toUpperCase() + status.slice(1)
}

function nameById(list: { id: string; name: string }[], id: string): string {
  return list.find((item) => item.id === id)?.name ?? 'Unknown'
}

interface SelectedPair {
  foodId: string
  childId: string
}

/** One row per Food/Child pair (ticket 12) -- the browse screen. Reads
 * `listFoodStatusSummary` for the row list and lazily loads a pair's full
 * history via `listLogEntries({ foodId, childId })` only once its row is
 * tapped, rather than fetching every history up front. */
export function BrowsePage() {
  const [children, setChildren] = useState<Child[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [reasonTags, setReasonTags] = useState<ReasonTag[]>([])
  const [summary, setSummary] = useState<FoodStatusSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selected, setSelected] = useState<SelectedPair | null>(null)
  const [history, setHistory] = useState<LogEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([listChildren(dataAccessClient), listFoods(dataAccessClient), listReasonTags(dataAccessClient), listFoodStatusSummary(dataAccessClient)])
      .then(([childrenResult, foodsResult, reasonTagsResult, summaryResult]) => {
        if (cancelled) return
        setChildren(childrenResult)
        setFoods(foodsResult)
        setReasonTags(reasonTagsResult)
        setSummary(summaryResult)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load the food list.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)
    listLogEntries(dataAccessClient, selected)
      .then((entries) => {
        if (!cancelled) setHistory(entries)
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : 'Could not load history.')
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  function reasonTagNames(ids: string[]): string {
    return ids.map((id) => nameById(reasonTags, id)).join(', ')
  }

  // Sorted by Food name, then Child name, so the list reads predictably
  // rather than in arbitrary most-recently-logged order.
  const sortedRows = [...summary].sort((a, b) => {
    const foodCompare = nameById(foods, a.foodId).localeCompare(nameById(foods, b.foodId))
    if (foodCompare !== 0) return foodCompare
    return nameById(children, a.childId).localeCompare(nameById(children, b.childId))
  })

  if (loading) {
    return (
      <AppLayout title="Browse foods">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress />
        </Box>
      </AppLayout>
    )
  }
  if (loadError) {
    return (
      <AppLayout title="Browse foods">
        <Alert severity="error">{loadError}</Alert>
      </AppLayout>
    )
  }

  const selectedFoodName = selected ? nameById(foods, selected.foodId) : ''
  const selectedChildName = selected ? nameById(children, selected.childId) : ''

  return (
    <AppLayout title="Browse foods">
      <Typography variant="h6" component="h2" gutterBottom>
        Foods by child
      </Typography>
      <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
        {sortedRows.length === 0 && (
          <ListItem>
            <ListItemText primary="No entries logged yet." />
          </ListItem>
        )}
        {sortedRows.map((row) => (
          <ListItemButton
            key={`${row.foodId}:${row.childId}`}
            onClick={() => setSelected({ foodId: row.foodId, childId: row.childId })}
          >
            <ListItemText
              primary={`${nameById(foods, row.foodId)} — ${nameById(children, row.childId)}`}
              secondary="Tap for full history"
            />
            <Chip size="small" label={statusLabel(row.status)} />
          </ListItemButton>
        ))}
      </List>

      <Dialog open={selected !== null} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {selectedFoodName} — {selectedChildName}
          <IconButton aria-label="Close" onClick={() => setSelected(null)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {historyLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress />
            </Box>
          )}
          {historyError && <Alert severity="error">{historyError}</Alert>}
          {!historyLoading && !historyError && (
            <List dense>
              {history.length === 0 && (
                <ListItem>
                  <ListItemText primary="No entries yet." />
                </ListItem>
              )}
              {history.map((entry) => (
                <ListItem key={entry.id} alignItems="flex-start" divider>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography component="span" sx={{ fontWeight: 500 }}>
                          {new Date(entry.createdAt).toLocaleString()}
                        </Typography>
                        <Chip size="small" label={statusLabel(entry.status)} />
                      </Box>
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
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
