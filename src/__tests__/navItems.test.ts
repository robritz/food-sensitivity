import { describe, expect, it } from 'vitest'
import { isNavItemActive, NAV_ITEMS } from '../components/navItems'

describe('NAV_ITEMS', () => {
  it('lists the map as the first (home) destination', () => {
    expect(NAV_ITEMS[0]).toMatchObject({ label: 'Map', to: '/' })
  })

  it('has a unique, non-empty label and route for every item', () => {
    const labels = NAV_ITEMS.map((item) => item.label)
    const routes = NAV_ITEMS.map((item) => item.to)
    expect(new Set(labels).size).toBe(NAV_ITEMS.length)
    expect(new Set(routes).size).toBe(NAV_ITEMS.length)
    expect(labels.every((label) => label.length > 0)).toBe(true)
    expect(routes.every((route) => route.startsWith('/'))).toBe(true)
  })
})

describe('isNavItemActive', () => {
  it('matches the home route only on an exact path', () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/', '/browse')).toBe(false)
    expect(isNavItemActive('/', '/map')).toBe(false)
  })

  it('matches a non-home route on an exact path', () => {
    expect(isNavItemActive('/browse', '/browse')).toBe(true)
    expect(isNavItemActive('/log', '/browse')).toBe(false)
  })

  it('matches a non-home route on nested sub-paths', () => {
    expect(isNavItemActive('/browse', '/browse/123')).toBe(true)
    expect(isNavItemActive('/log', '/logbook')).toBe(false)
  })
})
