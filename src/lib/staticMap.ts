/**
 * Web Mercator projection helpers for the map view (ticket 14): placing
 * clickable pin buttons on top of a Mapbox Static Images API image.
 *
 * There's no interactive map library (e.g. mapbox-gl) anywhere in this repo
 * -- ticket 10 only ever used Mapbox's reverse-geocoding REST endpoint via a
 * plain `fetch` (see `mapboxClient.ts` in data-access), not a rendered map
 * widget. Reusing "the same map library/token setup" from that ticket means
 * reusing `VITE_MAPBOX_TOKEN` and the same direct-HTTP-call style, not
 * introducing a new heavyweight JS map dependency. So the map view renders a
 * static raster image (Static Images API, with pins baked into the request
 * URL for a correct-looking image on its own) and overlays transparent
 * clickable buttons on top of it for tap-to-open. Mapbox's own "auto" fit
 * isn't used because its exact center/zoom isn't predictable client-side --
 * instead this module computes an explicit center/zoom itself, uses that
 * *same* center/zoom both to build the image URL and to place the overlay
 * buttons, so the two can never drift apart.
 */

const TILE_SIZE = 256
const MIN_ZOOM = 1
const MAX_ZOOM = 15
/** Zoom used to center on a single Location -- close enough to be useful
 * without a spread of points to size the view around. */
const SINGLE_POINT_ZOOM = 14

export interface LatLng {
  lat: number
  lng: number
}

export interface Viewport {
  width: number
  height: number
}

export interface MapView {
  center: LatLng
  zoom: number
}

function lngToWorldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * TILE_SIZE * 2 ** zoom
}

function latToWorldY(lat: number, zoom: number): number {
  const sinLat = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * TILE_SIZE * 2 ** zoom
}

/** Projects a lat/lng to a pixel offset within `viewport`, relative to
 * `view.center`/`view.zoom` -- for positioning an overlay button on top of a
 * static map image requested with that same center/zoom. */
export function projectPoint(point: LatLng, view: MapView, viewport: Viewport): { x: number; y: number } {
  const centerX = lngToWorldX(view.center.lng, view.zoom)
  const centerY = latToWorldY(view.center.lat, view.zoom)
  const pointX = lngToWorldX(point.lng, view.zoom)
  const pointY = latToWorldY(point.lat, view.zoom)
  return {
    x: viewport.width / 2 + (pointX - centerX),
    y: viewport.height / 2 + (pointY - centerY),
  }
}

/** Computes a center (midpoint of the points' bounding box) and zoom level
 * that fits every point within `viewport` (minus `padding` px on each side)
 * for the map view's pins. Falls back to `{ lat: 0, lng: 0 }` at the min
 * zoom for an empty list -- callers with no pins to show shouldn't be
 * calling this, but it degrades to "the whole world" rather than NaN. */
export function computeMapView(
  points: { latitude: number; longitude: number }[],
  viewport: Viewport,
  padding = 40,
): MapView {
  if (points.length === 0) {
    return { center: { lat: 0, lng: 0 }, zoom: MIN_ZOOM }
  }

  const lats = points.map((p) => p.latitude)
  const lngs = points.map((p) => p.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }

  if (points.length === 1) {
    return { center, zoom: SINGLE_POINT_ZOOM }
  }

  const availableWidth = Math.max(viewport.width - padding * 2, 1)
  const availableHeight = Math.max(viewport.height - padding * 2, 1)

  // Step down from the max zoom until the bounding box fits -- simpler than
  // solving for zoom directly and cheap enough at this scale (at most ~30
  // iterations, run once per map load, not per frame).
  let zoom = MAX_ZOOM
  while (zoom > MIN_ZOOM) {
    const spanWidth = lngToWorldX(maxLng, zoom) - lngToWorldX(minLng, zoom)
    // Latitude increases upward but pixel-Y increases downward, so the
    // north (max) latitude gives the smaller Y -- the box's top edge.
    const spanHeight = latToWorldY(minLat, zoom) - latToWorldY(maxLat, zoom)
    if (spanWidth <= availableWidth && spanHeight <= availableHeight) break
    zoom -= 0.5
  }

  return { center, zoom }
}

export interface StaticMapPin {
  latitude: number
  longitude: number
  /** 6-digit hex, no leading "#" (the format the Static Images API's marker
   * overlay syntax expects). */
  colorHex: string
}

/**
 * Builds a Mapbox Static Images API URL for `view`, with `pins` baked in as
 * small marker overlays so the raster image looks right on its own --
 * `projectPoint` is what makes the *clickable* overlay buttons line up with
 * these same pins, using the same `view`.
 */
export function buildStaticMapUrl(
  view: MapView,
  viewport: Viewport,
  pins: StaticMapPin[],
  token: string,
): string {
  const markers = pins.map((pin) => `pin-s+${pin.colorHex}(${pin.longitude},${pin.latitude})`).join(',')
  const overlay = markers.length > 0 ? `${markers}/` : ''
  const path = `${view.center.lng},${view.center.lat},${view.zoom}/${viewport.width}x${viewport.height}@2x`
  const url = new URL(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}${path}`)
  url.searchParams.set('access_token', token)
  return url.toString()
}
