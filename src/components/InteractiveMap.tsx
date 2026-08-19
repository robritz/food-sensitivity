/**
 * Real pan/zoom map view (ticket 18) replacing the ticket-14 static-image
 * approach (`../lib/staticMap.ts`, now removed) -- renders via `mapbox-gl`
 * directly rather than a React wrapper (e.g. `react-map-gl`) to avoid a
 * dependency on that wrapper's React-version compatibility; `mapbox-gl`
 * itself only needs a DOM container and is driven imperatively.
 *
 * mapbox-gl owns projection/fitting natively, so there's no hand-rolled
 * Web Mercator math to unit test here (unlike `staticMap.ts` before it) --
 * the one piece of pure math this component does need, spreading apart
 * markers whose real coordinates are too close to render as separate
 * screen pixels, lives in `../lib/pinLayout.ts` and is tested there.
 */
import type { LocationPin } from '@food-tracker/data-access'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef } from 'react'
import { PIN_HEX } from '../lib/pinColors'
import { spreadOverlappingPins } from '../lib/pinLayout'

/** Zoom used to center on a single Location -- close enough to be useful
 * without a spread of points to size the view around. */
const SINGLE_POINT_ZOOM = 14
const FIT_BOUNDS_PADDING = 40
const MAX_FIT_ZOOM = 15

interface InteractiveMapProps {
  pins: LocationPin[]
  token: string
  onSelectPin: (pin: LocationPin) => void
}

/** Interactive pan/zoom map with one marker per pin, tap-to-open. */
export function InteractiveMap({ pins, token, onSelectPin }: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  // Kept fresh across renders so the marker click handlers (attached once
  // per pins change, below) always call the latest callback without forcing
  // the map/markers to be torn down and rebuilt just because the parent
  // re-rendered with a new function identity.
  const onSelectPinRef = useRef(onSelectPin)
  onSelectPinRef.current = onSelectPin

  useEffect(() => {
    if (!containerRef.current) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [0, 0],
      zoom: 1,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [token])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Distinct Locations captured only meters apart (e.g. either side of a
    // street corner) would otherwise render on the same screen pixel and
    // hide each other -- render markers at their spread-out position, never
    // at the raw (possibly-coincident) Location coordinates.
    const positions = spreadOverlappingPins(
      pins.map((pin) => ({ id: pin.location.id, latitude: pin.location.latitude, longitude: pin.location.longitude })),
    )
    const positionFor = (pin: LocationPin) => positions.get(pin.location.id) ?? pin.location

    const markers = pins.map((pin) => {
      const { latitude, longitude } = positionFor(pin)
      const marker = new mapboxgl.Marker({ color: PIN_HEX[pin.color] }).setLngLat([longitude, latitude]).addTo(map)
      const el = marker.getElement()
      el.style.cursor = 'pointer'
      el.setAttribute('role', 'button')
      el.setAttribute('tabindex', '0')
      el.setAttribute('aria-label', `Open ${pin.location.name}`)
      el.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelectPinRef.current(pin)
      })
      // mapbox-gl's marker element is a plain <div>, not a native <button>
      // like the ticket-14 IconButton overlay it replaces -- Enter/Space
      // needs a manual handler to keep pins keyboard-operable.
      el.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelectPinRef.current(pin)
      })
      return marker
    })

    if (pins.length === 1) {
      const { latitude, longitude } = positionFor(pins[0])
      map.jumpTo({ center: [longitude, latitude], zoom: SINGLE_POINT_ZOOM })
    } else if (pins.length > 1) {
      const [first, ...rest] = pins
      const firstPosition = positionFor(first)
      const bounds = rest.reduce((acc, pin) => {
        const { latitude, longitude } = positionFor(pin)
        return acc.extend([longitude, latitude])
      }, new mapboxgl.LngLatBounds([firstPosition.longitude, firstPosition.latitude], [firstPosition.longitude, firstPosition.latitude]))
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, maxZoom: MAX_FIT_ZOOM })
    }

    return () => {
      for (const marker of markers) marker.remove()
    }
  }, [pins])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
