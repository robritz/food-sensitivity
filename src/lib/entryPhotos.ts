import type { LogEntryPhoto } from '@food-tracker/data-access'

/** Orders an entry's attached photos for display: oldest (upload order)
 * first, so a detail view's photo strip stays stable across re-fetches
 * rather than reflecting whatever order Storage's `list()` happened to
 * return. */
export function sortLogEntryPhotos(photos: LogEntryPhoto[]): LogEntryPhoto[] {
  return [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
