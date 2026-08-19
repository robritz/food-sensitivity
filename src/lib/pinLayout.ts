import { distanceMiles, type LatLng } from './geoDistance'

const METERS_PER_MILE = 1609.34
const METERS_PER_DEGREE_LAT = 111320

/**
 * Pins whose real-world Locations are closer together than this land on (or
 * within a pixel or two of) the same screen point at any zoom a caregiver
 * would actually use on the interactive map (ticket 18) -- close enough that
 * the closer marker fully hides the other, making it untappable. Nudging
 * them apart is a rendering fix only; it never changes the Location data
 * itself (coordinates, name, or which entries belong to which pin).
 */
const OVERLAP_THRESHOLD_METERS = 15
/** Distance from the shared centroid each pin in an overlapping cluster is
 * placed at once spread out -- comfortably separated at street-level zoom
 * without drifting into unrelated, actually-distant pins. */
const SPREAD_RADIUS_METERS = 12

export interface PositionedPin {
  id: string
  latitude: number
  longitude: number
}

function metersToLatOffset(meters: number): number {
  return meters / METERS_PER_DEGREE_LAT
}

function metersToLngOffset(meters: number, atLatitude: number): number {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((atLatitude * Math.PI) / 180)
  return meters / metersPerDegreeLng
}

/**
 * Returns the on-map coordinates to render each pin at: pins with no
 * neighbor within `OVERLAP_THRESHOLD_METERS` keep their real coordinates;
 * pins in a cluster of mutually-overlapping neighbors are fanned out evenly
 * around their shared centroid at `SPREAD_RADIUS_METERS`, so every pin stays
 * individually visible and tappable. Clustering is a single greedy pass
 * (each pin's cluster is everyone within range of *it*, not a transitive
 * closure) -- sufficient for the handful of near-duplicate captures this
 * exists to fix, not meant to be a general spatial-clustering algorithm.
 */
export function spreadOverlappingPins(pins: PositionedPin[]): Map<string, LatLng> {
  const positions = new Map<string, LatLng>()
  const visited = new Set<string>()

  for (const pin of pins) {
    if (visited.has(pin.id)) continue
    const cluster = pins.filter(
      (other) => !visited.has(other.id) && distanceMiles(pin, other) * METERS_PER_MILE <= OVERLAP_THRESHOLD_METERS,
    )
    for (const member of cluster) visited.add(member.id)

    if (cluster.length === 1) {
      const [only] = cluster
      positions.set(only.id, { latitude: only.latitude, longitude: only.longitude })
      continue
    }

    const centroid = {
      latitude: cluster.reduce((sum, p) => sum + p.latitude, 0) / cluster.length,
      longitude: cluster.reduce((sum, p) => sum + p.longitude, 0) / cluster.length,
    }
    cluster.forEach((member, index) => {
      const angle = (2 * Math.PI * index) / cluster.length
      positions.set(member.id, {
        latitude: centroid.latitude + metersToLatOffset(SPREAD_RADIUS_METERS * Math.sin(angle)),
        longitude: centroid.longitude + metersToLngOffset(SPREAD_RADIUS_METERS * Math.cos(angle), centroid.latitude),
      })
    })
  }

  return positions
}
