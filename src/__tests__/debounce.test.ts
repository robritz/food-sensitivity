import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce } from '../lib/debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delays the call until the wait elapses', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced('a')
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('coalesces rapid calls into a single trailing call', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced('a')
    vi.advanceTimersByTime(300)
    debounced('b')
    vi.advanceTimersByTime(300)
    debounced('c')
    vi.advanceTimersByTime(500)

    expect(fn).toHaveBeenCalledExactlyOnceWith('c')
  })

  it('cancel prevents a pending call from firing', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced('a')
    debounced.cancel()
    vi.advanceTimersByTime(500)

    expect(fn).not.toHaveBeenCalled()
  })
})
