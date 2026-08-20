/**
 * Delays `fn` until `waitMs` has passed with no further calls -- coalesces a
 * burst of calls (e.g. keystrokes) into a single trailing invocation with
 * the arguments of the last call. `cancel` drops a pending call outright,
 * for when the caller no longer wants it to fire (e.g. on unmount, or once
 * its input is no longer relevant).
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const debounced = (...args: Args) => {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      timeoutId = undefined
      fn(...args)
    }, waitMs)
  }

  debounced.cancel = () => {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    timeoutId = undefined
  }

  return debounced
}
