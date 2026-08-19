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
import { isWithinMiles, type LatLng } from '../lib/geoDistance'
import { PIN_HEX } from '../lib/pinColors'

// Lazy-loaded: `mapbox-gl` is a sizeable dependency (~1MB) that only the Map
// page needs -- code-splitting it out keeps it off every other page's bundle
// and out of the PWA precache's default 2MB-per-file limit.
const InteractiveMap = lazy(() => import('../components/InteractiveMap').then((m) => ({ default: m.InteractiveMap })))

const MAP_HEIGHT = 400
/** Ticket 19: map (and the location list under it) only shows Locations
 * within this many miles of the caregiver's current position, once known. */
const NEARBY_RADIUS_MILES = 20

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
 * logged there. Scoped to Locations within `NEARBY_RADIUS_MILES` of the
 * caregiver's current position when available (ticket 19); falls back to
 * every logged Location otherwise. */
export function MapPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedPin, setSelectedPin] = useState<LocationPin | null>(null)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)

  // Captures the caregiver's current position once per page visit so the map
  // (and the list below it) can be scoped to nearby Locations (ticket 19).
  // Degrades the same way ticket 10's capture does: no geolocation support
  // or a denied/failed request just leaves `userLocation` null, which falls
  // back to showing every logged Location unfiltered rather than blocking
  // the page.
  useEffect(() => {
    if (!navigator.geolocation) return
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      () => {
        // Denied or unavailable -- `userLocation` stays null.
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

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

  const allPins = useMemo(() => buildLocationPins(locations, entries), [locations, entries])
  const pins = useMemo(
    () => (userLocation ? allPins.filter((pin) => isWithinMiles(userLocation, pin.location, NEARBY_RADIUS_MILES)) : allPins),
    [allPins, userLocation],
  )

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
      {allPins.length === 0 && <Alert severity="info">No entries logged with a location yet.</Alert>}

      {allPins.length > 0 && pins.length === 0 && (
        <Alert severity="info">No logged locations within {NEARBY_RADIUS_MILES} miles of you.</Alert>
      )}

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
