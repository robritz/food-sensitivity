/**
 * Great-circle distance between two lat/lng points (ticket 19) -- scopes the
 * map view to Locations near the caregiver's current position rather than
 * every Location ever logged. Straight-line distance (Haversine formula),
 * not driving distance -- "how far away" for a map radius, not a route.
 */

const EARTH_RADIUS_MILES = 3958.8

export interface LatLng {
  latitude: number
  longitude: number
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function distanceMiles(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLng = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h))
}

export function isWithinMiles(a: LatLng, b: LatLng, radiusMiles: number): boolean {
  return distanceMiles(a, b) <= radiusMiles
}
