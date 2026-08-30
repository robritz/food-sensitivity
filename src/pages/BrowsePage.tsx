import {
  listCategories,
  listChildren,
  listFilteredLogEntries,
  listFoodStatusSummary,
  listFoods,
  listLocations,
  listLogEntries,
  listReasonTags,
  type ActiveFilters,
  type Category,
  type Child,
  type Food,
  type FoodStatusSummary,
  type Location,
  type LogEntry,
  type LogEntryStatus,
  type ReasonTag,
} from '@food-tracker/data-access'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '../components/AppLayout'
import { MultiSelectFilter } from '../components/MultiSelectFilter'
import { dataAccessClient } from '../lib/dataAccessClient'
import { nameById, reasonTagNames, STATUSES, statusLabel } from '../lib/entryFormatting'
import { buildExportRows } from '../lib/export'
import { exportEntriesAsCsv, exportEntriesAsPdf } from '../lib/exportDownload'

const SEARCH_DEBOUNCE_MS = 250

interface SelectedPair {
  foodId: string
  childId: string
}

/** One row per Food/Child pair (ticket 12) -- the browse screen. Filterable by
 * status, category, reason, child, location, and date range, plus free-text
 * search on Food name/brand (ticket 13): multiple values within one filter
 * type combine as OR, different filter types (and search) combine as AND --
 * see `filterLogEntries`/`listFoodStatusSummary` in data-access for the
 * matching logic. Selecting multiple children is the exception -- it means
 * overlap/AND (foods every selected child has logged), not union (ticket 24). Reads `listFoodStatusSummary` for the row list and lazily
 * loads a pair's full history via `listLogEntries({ foodId, childId })` only
 * once its row is tapped, rather than fetching every history up front. */
export function BrowsePage() {
  const [children, setChildren] = useState<Child[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [reasonTags, setReasonTags] = useState<ReasonTag[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [baseLoading, setBaseLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [summary, setSummary] = useState<FoodStatusSummary[]>([])
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [reasonFilter, setReasonFilter] = useState<string[]>([])
  const [childFilter, setChildFilter] = useState<string[]>([])
  const [locationFilter, setLocationFilter] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const [selected, setSelected] = useState<SelectedPair | null>(null)
  const [history, setHistory] = useState<LogEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listChildren(dataAccessClient),
      listFoods(dataAccessClient),
      listCategories(dataAccessClient),
      listReasonTags(dataAccessClient),
      listLocations(dataAccessClient),
    ])
      .then(([childrenResult, foodsResult, categoriesResult, reasonTagsResult, locationsResult]) => {
        if (cancelled) return
        setChildren(childrenResult)
        setFoods(foodsResult)
        setCategories(categoriesResult)
        setReasonTags(reasonTagsResult)
        setLocations(locationsResult)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load the food list.')
      })
      .finally(() => {
        if (!cancelled) setBaseLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounces the search text (like the food typeahead in LogPage) so typing
  // doesn't fire a query per keystroke -- multi-select filter changes below
  // are discrete clicks, so they refetch immediately.
  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeoutId)
  }, [searchInput])

  // `dateTo` is a plain yyyy-mm-dd from the date input; bump it to the end of
  // that day so the range is inclusive of everything logged on that date, not
  // just entries at exactly midnight.
  const activeFilters: ActiveFilters = useMemo(
    () => ({
      statuses: statusFilter.length > 0 ? (statusFilter as LogEntryStatus[]) : undefined,
      categoryIds: categoryFilter.length > 0 ? categoryFilter : undefined,
      reasonTagIds: reasonFilter.length > 0 ? reasonFilter : undefined,
      childIds: childFilter.length > 0 ? childFilter : undefined,
      locationIds: locationFilter.length > 0 ? locationFilter : undefined,
      occurredFrom: dateFrom || undefined,
      occurredTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
    }),
    [statusFilter, categoryFilter, reasonFilter, childFilter, locationFilter, dateFrom, dateTo],
  )

  useEffect(() => {
    let cancelled = false
    setSummaryLoading(true)
    setSummaryError(null)
    listFoodStatusSummary(dataAccessClient, { filters: activeFilters, search: debouncedSearch })
      .then((result) => {
        if (!cancelled) setSummary(result)
      })
      .catch((err) => {
        if (!cancelled) setSummaryError(err instanceof Error ? err.message : 'Could not load the food list.')
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeFilters, debouncedSearch])

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

  function clearFilters() {
    setStatusFilter([])
    setCategoryFilter([])
    setReasonFilter([])
    setChildFilter([])
    setLocationFilter([])
    setDateFrom('')
    setDateTo('')
    setSearchInput('')
  }

  const hasActiveFilters =
    statusFilter.length > 0 ||
    categoryFilter.length > 0 ||
    reasonFilter.length > 0 ||
    childFilter.length > 0 ||
    locationFilter.length > 0 ||
    dateFrom !== '' ||
    dateTo !== '' ||
    searchInput.trim() !== ''

  // Export (ticket 16) reads the same `activeFilters`/`debouncedSearch` the
  // browse list itself is filtered by, so "export" always means "export
  // what's currently on screen" -- re-fetches the full (non-deduped) match
  // set via `listFilteredLogEntries` rather than reusing `summary`, which is
  // collapsed to one row per Food/Child pair.
  async function handleExport(format: 'csv' | 'pdf') {
    setExportError(null)
    setExporting(format)
    try {
      const entries = await listFilteredLogEntries(dataAccessClient, { filters: activeFilters, search: debouncedSearch })
      const rows = buildExportRows(entries, { foods, children, categories, reasonTags, locations })
      if (format === 'csv') {
        exportEntriesAsCsv(rows)
      } else {
        await exportEntriesAsPdf(dataAccessClient, rows)
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export entries.')
    } finally {
      setExporting(null)
    }
  }

  // Sorted by Food name, then Child name, so the list reads predictably
  // rather than in arbitrary most-recently-logged order. Memoized so the
  // sort (and its per-comparison name lookups) only reruns when the summary
  // or the name sources change, not on every keystroke/filter re-render.
  const sortedRows = useMemo(
    () =>
      [...summary].sort((a, b) => {
        const foodCompare = nameById(foods, a.foodId).localeCompare(nameById(foods, b.foodId))
        if (foodCompare !== 0) return foodCompare
        return nameById(children, a.childId).localeCompare(nameById(children, b.childId))
      }),
    [summary, foods, children],
  )

  if (baseLoading) {
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
        Filters
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <TextField
            size="small"
            fullWidth
            label="Search food name/brand"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MultiSelectFilter
            label="Status"
            options={STATUSES.map((status) => ({ id: status, name: statusLabel(status) }))}
            selectedIds={statusFilter}
            onChange={setStatusFilter}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MultiSelectFilter label="Category" options={categories} selectedIds={categoryFilter} onChange={setCategoryFilter} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MultiSelectFilter label="Reason" options={reasonTags} selectedIds={reasonFilter} onChange={setReasonFilter} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MultiSelectFilter label="Child" options={children} selectedIds={childFilter} onChange={setChildFilter} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MultiSelectFilter label="Location" options={locations} selectedIds={locationFilter} onChange={setLocationFilter} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: 2 }}>
          <TextField
            size="small"
            fullWidth
            label="From"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: 2 }}>
          <TextField
            size="small"
            fullWidth
            label="To"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        {hasActiveFilters && (
          <Grid size={{ xs: 12 }}>
            <Button size="small" onClick={clearFilters}>
              Clear filters
            </Button>
          </Grid>
        )}
      </Grid>

      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
        <Button
          size="small"
          variant="outlined"
          disabled={exporting !== null}
          onClick={() => handleExport('csv')}
        >
          {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={exporting !== null}
          onClick={() => handleExport('pdf')}
        >
          {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
        </Button>
      </Stack>
      {exportError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {exportError}
        </Alert>
      )}

      <Typography variant="h6" component="h2" gutterBottom>
        Foods by child
      </Typography>
      {summaryError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {summaryError}
        </Alert>
      )}
      <Box sx={{ position: 'relative' }}>
        {summaryLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {!summaryLoading && !summaryError && (
          <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
            {sortedRows.length === 0 && (
              <ListItem>
                <ListItemText primary={hasActiveFilters ? 'No entries match these filters.' : 'No entries logged yet.'} />
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
        )}
      </Box>

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
                        {reasonTagNames(reasonTags, entry.reasonTagIds)}
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
