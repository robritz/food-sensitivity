import { describe, expect, it } from 'vitest'
import { buildStaticMapUrl, computeMapView, projectPoint } from '../lib/staticMap'

// Pure Web Mercator projection math backing the map view's (ticket 14) pin
// overlay -- placing clickable buttons on top of a static Mapbox image at
// the same center/zoom the image itself was requested with.

describe('projectPoint', () => {
  it('projects a point at the view center to the middle of the viewport', () => {
    const view = { center: { lat: 40, lng: -74 }, zoom: 10 }
    const viewport = { width: 600, height: 400 }

    const pixel = projectPoint({ lat: 40, lng: -74 }, view, viewport)

    expect(pixel.x).toBeCloseTo(300)
    expect(pixel.y).toBeCloseTo(200)
  })

  it('projects a point east/south of center to the right/below the middle', () => {
    const view = { center: { lat: 40, lng: -74 }, zoom: 10 }
    const viewport = { width: 600, height: 400 }

    const pixel = projectPoint({ lat: 39, lng: -73 }, view, viewport)

    expect(pixel.x).toBeGreaterThan(300)
    expect(pixel.y).toBeGreaterThan(200)
  })
})

describe('computeMapView', () => {
  it('centers on the single point with a reasonable default zoom when there is only one', () => {
    const view = computeMapView([{ latitude: 40, longitude: -74 }], { width: 600, height: 400 })

    expect(view.center).toEqual({ lat: 40, lng: -74 })
    expect(view.zoom).toBeGreaterThan(0)
  })

  it('centers on the midpoint of multiple points', () => {
    const view = computeMapView(
      [
        { latitude: 40, longitude: -74 },
        { latitude: 42, longitude: -72 },
      ],
      { width: 600, height: 400 },
    )

    expect(view.center.lat).toBeCloseTo(41)
    expect(view.center.lng).toBeCloseTo(-73)
  })

  it('picks a lower zoom for points spread further apart', () => {
    const close = computeMapView(
      [
        { latitude: 40, longitude: -74 },
        { latitude: 40.01, longitude: -74.01 },
      ],
      { width: 600, height: 400 },
    )
    const far = computeMapView(
      [
        { latitude: 40, longitude: -74 },
        { latitude: 10, longitude: -40 },
      ],
      { width: 600, height: 400 },
    )

    expect(far.zoom).toBeLessThan(close.zoom)
  })
})

describe('buildStaticMapUrl', () => {
  it('embeds the center, zoom, viewport, token, and one pin marker per pin', () => {
    const view = { center: { lat: 40, lng: -74 }, zoom: 12 }
    const viewport = { width: 600, height: 400 }

    const url = buildStaticMapUrl(view, viewport, [{ latitude: 40, longitude: -74, colorHex: 'ef4444' }], 'test-token')

    expect(url).toContain('pin-s+ef4444(-74,40)')
    expect(url).toContain('-74,40,12/600x400@2x')
    expect(new URL(url).searchParams.get('access_token')).toBe('test-token')
  })

  it('omits the marker overlay segment entirely when there are no pins', () => {
    const view = { center: { lat: 0, lng: 0 }, zoom: 1 }
    const viewport = { width: 600, height: 400 }

    const url = buildStaticMapUrl(view, viewport, [], 'test-token')

    expect(url).not.toContain('pin-s')
  })
})
