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
  type PinColor,
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
import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '../components/AppLayout'
import { dataAccessClient } from '../lib/dataAccessClient'
import { buildStaticMapUrl, computeMapView, projectPoint, type StaticMapPin } from '../lib/staticMap'

const MAP_WIDTH = 600
const MAP_HEIGHT = 400
// Single shared instance -- `view` (computeMapView) and the overlay button
// positions (projectPoint) must agree on the exact same viewport as the
// static image URL (buildStaticMapUrl), or pins drift off their markers.
const VIEWPORT = { width: MAP_WIDTH, height: MAP_HEIGHT }
/** Diameter (px) of the tappable overlay circle centered on each pin --
 * bigger than the rendered marker glyph itself so it's still an easy tap
 * target on a phone. */
const PIN_HIT_SIZE = 36

// Same red/yellow/green vocabulary as `buildLocationPins`' `PinColor` --
// kept here (rather than exported from data-access) since actual hex values
// are a presentation concern, not a domain one.
const PIN_HEX: Record<PinColor, string> = {
  red: 'ef4444',
  yellow: 'eab308',
  green: '22c55e',
}

function statusLabel(status: LogEntryStatus): string {
  return status[0].toUpperCase() + status.slice(1)
}

function nameById(list: { id: string; name: string }[], id: string): string {
  return list.find((item) => item.id === id)?.name ?? 'Unknown'
}

/** Loads every Location the household has logged food at plus every logged
 * entry, and renders one map pin per Location (ticket 14) -- color-coded by
 * `buildLocationPins`' status-mix rule, tap-to-open showing the foods/entries
 * logged there. See `../lib/staticMap.ts` for why this is a static image
 * with an overlay rather than an interactive map widget. */
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

  const view = useMemo(() => computeMapView(pins.map((pin) => pin.location), VIEWPORT), [pins])

  const staticMapUrl = useMemo(() => {
    if (!token || pins.length === 0) return null
    const staticPins: StaticMapPin[] = pins.map((pin) => ({
      latitude: pin.location.latitude,
      longitude: pin.location.longitude,
      colorHex: PIN_HEX[pin.color],
    }))
    return buildStaticMapUrl(view, VIEWPORT, staticPins, token)
  }, [token, pins, view])

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

      {pins.length > 0 && token && staticMapUrl && (
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            maxWidth: MAP_WIDTH,
            aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
            mx: 'auto',
            mb: 2,
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <Box
            component="img"
            src={staticMapUrl}
            alt="Map of logged locations"
            sx={{ width: '100%', height: '100%', display: 'block' }}
          />
          {pins.map((pin) => {
            const pixel = projectPoint({ lat: pin.location.latitude, lng: pin.location.longitude }, view, VIEWPORT)
            return (
              <IconButton
                key={pin.location.id}
                aria-label={`Open ${pin.location.name}`}
                onClick={() => setSelectedPin(pin)}
                sx={{
                  position: 'absolute',
                  left: `${(pixel.x / MAP_WIDTH) * 100}%`,
                  // The marker glyph's tip points at the coordinate, so
                  // shift the hit target up to sit over the tip rather than
                  // straddling it.
                  top: `calc(${(pixel.y / MAP_HEIGHT) * 100}% - ${PIN_HIT_SIZE / 2}px)`,
                  width: PIN_HIT_SIZE,
                  height: PIN_HIT_SIZE,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )
          })}
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
                sx={{ bgcolor: `#${PIN_HEX[pin.color]}`, width: 16, height: 16, mr: 1.5 }}
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
