import {
  buildLocationPins,
  listChildren,
  listFoods,
  listLocations,
  listLogEntries,
  type Child,
  type Food,
  type Location,
  type LocationPin,
  type LogEntry,
  type LogEntryStatus,
} from '@food-tracker/data-access'
import CloseIcon from '@mui/icons-material/Close'
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
  ListItemText,
  Typography,
} from '@mui/material'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AppLayout } from '../components/AppLayout'
import { dataAccessClient } from '../lib/dataAccessClient'
import { PIN_HEX } from '../lib/pinColors'

// Lazy-loaded: `mapbox-gl` is a sizeable dependency (~1MB) that only the Map
// page needs -- code-splitting it out keeps it off every other page's bundle
// and out of the PWA precache's default 2MB-per-file limit.
const InteractiveMap = lazy(() => import('../components/InteractiveMap').then((m) => ({ default: m.InteractiveMap })))

const MAP_HEIGHT = 400

function statusLabel(status: LogEntryStatus): string {
  return status[0].toUpperCase() + status.slice(1)
}

function nameById(list: { id: string; name: string }[], id: string): string {
  return list.find((item) => item.id === id)?.name ?? 'Unknown'
}

/** Loads every Location the household has logged food at plus every logged
 * entry, and renders one map pin per Location (ticket 14, made interactive
 * in ticket 18 via `../components/InteractiveMap`) -- color-coded by
 * `buildLocationPins`' status-mix rule, tap-to-open showing the foods/entries
 * logged there. */
export function MapPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedPin, setSelectedPin] = useState<LocationPin | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listLocations(dataAccessClient),
      listLogEntries(dataAccessClient),
      listFoods(dataAccessClient),
      listChildren(dataAccessClient),
    ])
      .then(([locationsResult, entriesResult, foodsResult, childrenResult]) => {
        if (cancelled) return
        setLocations(locationsResult)
        setEntries(entriesResult)
        setFoods(foodsResult)
        setChildren(childrenResult)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load the map.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const pins = useMemo(() => buildLocationPins(locations, entries), [locations, entries])

  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

  if (loading) {
    return (
      <AppLayout title="Map">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress />
        </Box>
      </AppLayout>
    )
  }
  if (loadError) {
    return (
      <AppLayout title="Map">
        <Alert severity="error">{loadError}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Map">
      {pins.length === 0 && <Alert severity="info">No entries logged with a location yet.</Alert>}

      {pins.length > 0 && !token && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Map imagery is unavailable (missing Mapbox token) -- showing locations as a list instead.
        </Alert>
      )}

      {pins.length > 0 && token && (
        <Box
          sx={{
            width: '100%',
            height: MAP_HEIGHT,
            mb: 2,
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <Suspense
            fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress />
              </Box>
            }
          >
            <InteractiveMap pins={pins} token={token} onSelectPin={setSelectedPin} />
          </Suspense>
        </Box>
      )}

      {pins.length > 0 && (
        <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
          {pins.map((pin) => (
            <ListItem
              key={pin.location.id}
              onClick={() => setSelectedPin(pin)}
              sx={{ cursor: 'pointer' }}
            >
              <Chip
                size="small"
                label=" "
                sx={{ bgcolor: PIN_HEX[pin.color], width: 16, height: 16, mr: 1.5 }}
              />
              <ListItemText
                primary={pin.location.name}
                secondary={`${pin.entries.length} ${pin.entries.length === 1 ? 'entry' : 'entries'} logged -- tap for details`}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={selectedPin !== null} onClose={() => setSelectedPin(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {selectedPin?.location.name}
          <IconButton aria-label="Close" onClick={() => setSelectedPin(null)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <List dense>
            {selectedPin?.entries.map((entry) => (
              <ListItem key={entry.id} alignItems="flex-start" divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography component="span" sx={{ fontWeight: 500 }}>
                        {nameById(foods, entry.foodId)} — {nameById(children, entry.childId)}
                      </Typography>
                      <Chip size="small" label={statusLabel(entry.status)} />
                    </Box>
                  }
                  secondary={
                    <>
                      {new Date(entry.occurredAt).toLocaleString()}
                      {entry.notes ? ` — "${entry.notes}"` : ''}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
