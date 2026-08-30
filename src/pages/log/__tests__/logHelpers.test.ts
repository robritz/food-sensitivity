import { describe, expect, it } from 'vitest'
import {
  findByNameCaseInsensitive,
  nameById,
  reasonTagNames,
  resolveLocationName,
  statusLabel,
  toDatetimeLocalValue,
} from '../logHelpers'

describe('toDatetimeLocalValue', () => {
  it('formats a date as a zero-padded local datetime-local string', () => {
    // Local time (not UTC): constructed via the local-time Date ctor.
    expect(toDatetimeLocalValue(new Date(2026, 0, 5, 9, 3))).toBe('2026-01-05T09:03')
    expect(toDatetimeLocalValue(new Date(2026, 11, 25, 23, 59))).toBe('2026-12-25T23:59')
  })
})

describe('statusLabel', () => {
  it('capitalizes the first letter', () => {
    expect(statusLabel('liked')).toBe('Liked')
    expect(statusLabel('disliked')).toBe('Disliked')
    expect(statusLabel('inconsistent')).toBe('Inconsistent')
  })
})

describe('findByNameCaseInsensitive', () => {
  const options = [
    { id: '1', name: 'Fruit' },
    { id: '2', name: 'Dairy' },
  ]

  it('matches regardless of casing', () => {
    expect(findByNameCaseInsensitive(options, 'fruit')?.id).toBe('1')
    expect(findByNameCaseInsensitive(options, 'DAIRY')?.id).toBe('2')
  })

  it('returns undefined when nothing matches', () => {
    expect(findByNameCaseInsensitive(options, 'Grain')).toBeUndefined()
  })
})

describe('nameById', () => {
  const list = [{ id: 'a', name: 'Alice' }]

  it('returns the matching name', () => {
    expect(nameById(list, 'a')).toBe('Alice')
  })

  it('falls back to "Unknown" for a missing id', () => {
    expect(nameById(list, 'z')).toBe('Unknown')
  })
})

describe('reasonTagNames', () => {
  const tags = [
    { id: 't1', name: 'Texture' },
    { id: 't2', name: 'Smell' },
  ]

  it('joins the names of the given ids', () => {
    expect(reasonTagNames(tags, ['t1', 't2'])).toBe('Texture, Smell')
  })

  it('renders unknown ids as "Unknown"', () => {
    expect(reasonTagNames(tags, ['t1', 'nope'])).toBe('Texture, Unknown')
  })

  it('is empty for no ids', () => {
    expect(reasonTagNames(tags, [])).toBe('')
  })
})

describe('resolveLocationName', () => {
  const coords = { latitude: 1, longitude: 2 }

  it('returns undefined without coordinates (log without a place)', () => {
    expect(resolveLocationName(null, 'Trader Joe’s')).toBeUndefined()
  })

  it('returns undefined for blank/whitespace input even with coordinates', () => {
    expect(resolveLocationName(coords, '')).toBeUndefined()
    expect(resolveLocationName(coords, '   ')).toBeUndefined()
  })

  it('returns the trimmed name when coordinates and text are present', () => {
    expect(resolveLocationName(coords, '  Trader Joe’s  ')).toBe('Trader Joe’s')
  })
})
