import { getLogEntryPhotoUrl, listLogEntryPhotos, type DataAccessClient } from '@food-tracker/data-access'
import { buildExportPdf, entryRowsToCsv, type ExportRow } from './export'

function defaultFilenamePrefix(): string {
  return `food-tracker-export-${new Date().toISOString().slice(0, 10)}`
}

/** Triggers a browser download for an in-memory Blob -- the same
 * create-a-throwaway-object-URL-and-click-a-link pattern every "export a
 * file with no server round-trip" flow uses, since there's no server side
 * to this export (ticket 16 is client-only). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read photo.'))
    reader.readAsDataURL(blob)
  })
}

/** Fetches every photo attached to an entry as an inline data URL -- jsPDF's
 * `addImage` needs actual image bytes, not a URL, and the signed URLs
 * `getLogEntryPhotoUrl` returns expire in 60s (private bucket), so they're
 * resolved and downloaded here rather than embedded as a bare link. */
async function fetchEntryPhotoDataUrls(client: DataAccessClient, entryId: string): Promise<string[]> {
  const photos = await listLogEntryPhotos(client, entryId)
  const urls = await Promise.all(photos.map((photo) => getLogEntryPhotoUrl(client, photo.path)))
  const blobs = await Promise.all(urls.map((url) => fetch(url).then((res) => res.blob())))
  return Promise.all(blobs.map(blobToDataUrl))
}

/** CSV export (ticket 16): structured data only, no photos, so it needs no
 * `DataAccessClient` -- everything it renders is already in `rows`. */
export function exportEntriesAsCsv(rows: ExportRow[], filenamePrefix = defaultFilenamePrefix()): void {
  downloadBlob(new Blob([entryRowsToCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${filenamePrefix}.csv`)
}

/**
 * PDF export (ticket 16): fetches each row's photos and builds/downloads the
 * report. A row's photo fetch failing (expired signed URL, network blip)
 * only drops that row's thumbnails -- it shouldn't fail the whole export,
 * since the entry details are still worth having without the pictures.
 */
export async function exportEntriesAsPdf(
  client: DataAccessClient,
  rows: ExportRow[],
  filenamePrefix = defaultFilenamePrefix(),
): Promise<void> {
  const photoEntries = await Promise.all(
    rows.map(async (row): Promise<[string, string[]]> => {
      try {
        return [row.entryId, await fetchEntryPhotoDataUrls(client, row.entryId)];
      } catch {
        return [row.entryId, []];
      }
    }),
  )
  const photoDataUrlsByEntryId = Object.fromEntries(photoEntries)
  const doc = buildExportPdf(rows, photoDataUrlsByEntryId)
  downloadBlob(doc.output('blob'), `${filenamePrefix}.pdf`)
}
