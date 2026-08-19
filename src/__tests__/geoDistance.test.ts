import { describe, expect, it } from 'vitest'
import { distanceMiles, isWithinMiles } from '../lib/geoDistance'

// Pure Haversine distance math backing the map view's (ticket 19) 20-mile
// radius scoping -- filtering Locations to ones near the caregiver's current
// position.

describe('distanceMiles', () => {
  it('is zero for the same point', () => {
    const point = { latitude: 40.7128, longitude: -74.006 }

    expect(distanceMiles(point, point)).toBeCloseTo(0)
  })

  it('is symmetric', () => {
    const a = { latitude: 40.7128, longitude: -74.006 }
    const b = { latitude: 34.0522, longitude: -118.2437 }

    expect(distanceMiles(a, b)).toBeCloseTo(distanceMiles(b, a))
  })

  it('matches the known straight-line distance between two cities', () => {
    // New York, NY -> Philadelphia, PA is ~80 miles direct.
    const nyc = { latitude: 40.7128, longitude: -74.006 }
    const philly = { latitude: 39.9526, longitude: -75.1652 }

    const distance = distanceMiles(nyc, philly)

    expect(distance).toBeGreaterThan(78)
    expect(distance).toBeLessThan(82)
  })
})

describe('isWithinMiles', () => {
  it('is true for a point inside the radius', () => {
    const nyc = { latitude: 40.7128, longitude: -74.006 }
    const philly = { latitude: 39.9526, longitude: -75.1652 }

    expect(isWithinMiles(nyc, philly, 100)).toBe(true)
  })

  it('is false for a point outside the radius', () => {
    const nyc = { latitude: 40.7128, longitude: -74.006 }
    const losAngeles = { latitude: 34.0522, longitude: -118.2437 }

    expect(isWithinMiles(nyc, losAngeles, 100)).toBe(false)
  })

  it('is true exactly at the boundary', () => {
    const point = { latitude: 40.7128, longitude: -74.006 }

    expect(isWithinMiles(point, point, 0)).toBe(true)
  })
})
