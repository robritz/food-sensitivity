import { describe, expect, it } from 'vitest'
import { sortLogEntryPhotos } from '../entryPhotos'

describe('sortLogEntryPhotos', () => {
  it('returns an empty array for an entry with no photos', () => {
    expect(sortLogEntryPhotos([])).toEqual([])
  })

  it('orders photos oldest (upload order) first, regardless of input order', () => {
    const oldest = { path: 'h/e/oldest.jpg', name: 'oldest.jpg', createdAt: '2026-01-01T00:00:00.000Z' }
    const middle = { path: 'h/e/middle.jpg', name: 'middle.jpg', createdAt: '2026-01-02T00:00:00.000Z' }
    const newest = { path: 'h/e/newest.jpg', name: 'newest.jpg', createdAt: '2026-01-03T00:00:00.000Z' }

    expect(sortLogEntryPhotos([newest, oldest, middle])).toEqual([oldest, middle, newest])
  })

  it('preserves relative order for photos with identical or missing createdAt', () => {
    const first = { path: 'h/e/first.jpg', name: 'first.jpg', createdAt: '' }
    const second = { path: 'h/e/second.jpg', name: 'second.jpg', createdAt: '' }
    const third = { path: 'h/e/third.jpg', name: 'third.jpg', createdAt: '' }

    expect(sortLogEntryPhotos([first, second, third])).toEqual([first, second, third])
  })
})
