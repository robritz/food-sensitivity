import { describe, expect, it } from 'vitest'
import { distanceMiles } from '../lib/geoDistance'
import { spreadOverlappingPins } from '../lib/pinLayout'

const METERS_PER_MILE = 1609.34

// Pure pin-spreading math backing the map view's overlapping-pin fix: two
// Locations captured meters apart (distinct real addresses, e.g. either
// side of a street corner) otherwise render on the same screen pixel and
// hide each other.

describe('spreadOverlappingPins', () => {
  it('leaves a single pin unchanged', () => {
    const pins = [{ id: 'a', latitude: 40.7128, longitude: -74.006 }]

    const positions = spreadOverlappingPins(pins)

    expect(positions.get('a')).toEqual({ latitude: 40.7128, longitude: -74.006 })
  })

  it('leaves pins far apart from each other unchanged', () => {
    const pins = [
      { id: 'a', latitude: 40.7128, longitude: -74.006 },
      { id: 'b', latitude: 34.0522, longitude: -118.2437 },
    ]

    const positions = spreadOverlappingPins(pins)

    expect(positions.get('a')).toEqual({ latitude: 40.7128, longitude: -74.006 })
    expect(positions.get('b')).toEqual({ latitude: 34.0522, longitude: -118.2437 })
  })

  it('spreads two pins that are only meters apart into distinct, separated positions', () => {
    const pins = [
      { id: 'a', latitude: 41.3854731998536, longitude: 2.1618568010535 },
      { id: 'b', latitude: 41.3854843086645, longitude: 2.16187421920193 },
    ]

    const positions = spreadOverlappingPins(pins)
    const posA = positions.get('a')!
    const posB = positions.get('b')!

    expect(posA).not.toEqual(posB)
    // Both pins are pushed out from their shared centroid to the same
    // spread radius, so they land twice that distance apart from each
    // other -- comfortably more separated than the ~1.5m they started at.
    const separationMeters = distanceMiles(posA, posB) * METERS_PER_MILE
    expect(separationMeters).toBeGreaterThan(20)
  })

  it('gives every pin in a larger overlapping cluster a distinct position', () => {
    const base = { latitude: 41.3854731998536, longitude: 2.1618568010535 }
    const pins = [
      { id: 'a', ...base },
      { id: 'b', latitude: base.latitude + 0.00001, longitude: base.longitude },
      { id: 'c', latitude: base.latitude, longitude: base.longitude + 0.00001 },
    ]

    const positions = spreadOverlappingPins(pins)
    const values = pins.map((pin) => positions.get(pin.id)!)

    const unique = new Set(values.map((v) => `${v.latitude},${v.longitude}`))
    expect(unique.size).toBe(3)
  })

  it('does not let an overlapping cluster leak into an unrelated distant pin', () => {
    const pins = [
      { id: 'a', latitude: 41.3854731998536, longitude: 2.1618568010535 },
      { id: 'b', latitude: 41.3854843086645, longitude: 2.16187421920193 },
      { id: 'far', latitude: 34.0522, longitude: -118.2437 },
    ]

    const positions = spreadOverlappingPins(pins)

    expect(positions.get('far')).toEqual({ latitude: 34.0522, longitude: -118.2437 })
  })
})
