import type { LogEntryStatus } from '@food-tracker/data-access'

export const STATUSES: LogEntryStatus[] = ['liked', 'disliked', 'inconsistent']

/** "Date happened" as a `datetime-local`-input-compatible string, in the
 * caregiver's local time zone (unlike `toISOString`, which is always UTC and
 * would show the wrong wall-clock time in the field). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function statusLabel(status: LogEntryStatus): string {
  return status[0].toUpperCase() + status.slice(1)
}

/** Finds a same-name match (case-insensitive) among already-loaded named
 * options -- used before creating a custom category/reason tag so a typo
 * in casing (e.g. "fruit" vs "Fruit") reuses the existing one instead of
 * spawning a confusing near-duplicate. */
export function findByNameCaseInsensitive<T extends { name: string }>(options: T[], name: string): T | undefined {
  return options.find((option) => option.name.toLowerCase() === name.toLowerCase())
}

export function nameById(list: { id: string; name: string }[], id: string): string {
  return list.find((item) => item.id === id)?.name ?? 'Unknown'
}

export function reasonTagNames(reasonTags: { id: string; name: string }[], ids: string[]): string {
  return ids.map((id) => nameById(reasonTags, id)).join(', ')
}

/** Shared by the location hook's `resolveLocationId` and `buildLocationCapture`:
 * no captured coordinates, or no place name (suggested or manually typed),
 * both mean "log without a place" -- returns undefined either way so both
 * callers can bail out the same way. */
export function resolveLocationName(
  locationCoords: { latitude: number; longitude: number } | null,
  inputValue: string,
): string | undefined {
  if (!locationCoords) return undefined
  const name = inputValue.trim()
  return name === '' ? undefined : name
}
