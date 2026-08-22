import { jsPDF } from 'jspdf'
import type { Category, Child, Food, Location, LogEntry, LogEntryStatus, ReasonTag } from '@food-tracker/data-access'

export interface ExportLookups {
  foods: Food[]
  children: Child[]
  categories: Category[]
  reasonTags: ReasonTag[]
  locations: Location[]
}

export interface ExportRow {
  entryId: string
  childName: string
  foodName: string
  categoryName: string
  status: LogEntryStatus
  intensity: number | null
  /** ISO timestamp -- kept as the raw `occurredAt` string rather than a
   * locale-formatted one, so CSV/PDF renderers can format it however suits
   * each output (a spreadsheet cell vs. a printed report line). */
  occurredAt: string
  locationName: string
  reasonTagNames: string[]
  notes: string
}

function nameById(list: { id: string; name: string }[], id: string | null): string {
  if (id === null) return ''
  return list.find((item) => item.id === id)?.name ?? 'Unknown'
}

/** Joins the household's filtered entries (ticket 16) with the Food/Child/
 * Category/Location/reason-tag names a caregiver actually recognizes --
 * `LogEntry` itself only carries ids. Mirrors the `nameById`/`reasonTagNames`
 * pattern `BrowsePage`/`LogPage` already use for the same lookup, just
 * collected into a flat row shape both the CSV and PDF export share. */
export function buildExportRows(entries: LogEntry[], lookups: ExportLookups): ExportRow[] {
  return entries.map((entry) => ({
    entryId: entry.id,
    childName: nameById(lookups.children, entry.childId),
    foodName: nameById(lookups.foods, entry.foodId),
    categoryName: nameById(
      lookups.categories,
      lookups.foods.find((food) => food.id === entry.foodId)?.categoryId ?? null,
    ),
    status: entry.status,
    intensity: entry.intensity,
    occurredAt: entry.occurredAt,
    locationName: nameById(lookups.locations, entry.locationId),
    reasonTagNames: entry.reasonTagIds.map((id) => nameById(lookups.reasonTags, id)),
    notes: entry.notes ?? '',
  }))
}

const CSV_HEADER = ['Child', 'Food', 'Category', 'Status', 'Intensity', 'Date', 'Location', 'Reasons', 'Notes']

/** Quotes a CSV field only when it needs it (contains a comma, quote, or
 * newline), doubling any embedded quotes -- the standard RFC 4180 escaping
 * rule, so the file opens correctly in a spreadsheet rather than shifting
 * columns on a caregiver's note that happens to contain a comma. */
function csvField(value: string | number): string {
  const text = String(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

/** CSV export (ticket 16): structured entry data only, no photos -- the
 * counterpart to the photo-including PDF export. `\r\n` line endings match
 * RFC 4180 / what Excel expects. */
export function entryRowsToCsv(rows: ExportRow[]): string {
  const lines = [
    CSV_HEADER,
    ...rows.map((row) => [
      row.childName,
      row.foodName,
      row.categoryName,
      row.status,
      row.intensity ?? '',
      row.occurredAt,
      row.locationName,
      row.reasonTagNames.join(', '),
      row.notes,
    ]),
  ]
  return lines.map((line) => line.map(csvField).join(',')).join('\r\n') + '\r\n'
}

function statusLabel(status: LogEntryStatus): string {
  return status[0].toUpperCase() + status.slice(1)
}

/** "{child} — {food}" -- the PDF's per-entry heading, same pairing shown as
 * the primary line in `LogPage`/`BrowsePage`'s own entry lists. */
export function formatEntryHeader(row: ExportRow): string {
  return `${row.childName} — ${row.foodName}`
}

/** The PDF's per-entry subline: category, status, intensity (if rated),
 * when it happened, and where (if captured) -- everything but the
 * free-form reasons/notes, which get their own lines since they can run
 * long. */
export function formatEntryMeta(row: ExportRow): string {
  const parts = [row.categoryName, statusLabel(row.status)]
  if (row.intensity !== null) parts.push(`Intensity ${row.intensity}/5`)
  parts.push(new Date(row.occurredAt).toLocaleString())
  if (row.locationName) parts.push(row.locationName)
  return parts.join(' • ')
}

export function formatEntryReasons(row: ExportRow): string {
  return `Reasons: ${row.reasonTagNames.join(', ')}`
}

/** A data URL's declared MIME type, mapped to the format string jsPDF's
 * `addImage` expects -- Storage-uploaded photos can be any common image
 * type (ticket 09 doesn't restrict `accept` beyond "image/*"), so this
 * can't be hardcoded to one format the way a fixed asset could be. */
function jsPdfImageFormat(dataUrl: string): string {
  const match = /^data:image\/(\w+);base64,/.exec(dataUrl)
  const subtype = match?.[1]?.toLowerCase()
  if (subtype === 'jpg' || subtype === 'jpeg') return 'JPEG'
  if (subtype === 'png') return 'PNG'
  if (subtype === 'webp') return 'WEBP'
  return 'JPEG' // jsPDF's own fallback guess for anything else
}

const PDF_MARGIN_MM = 15
const PDF_LINE_HEIGHT_MM = 6
const PDF_THUMBNAIL_MM = 28
const PDF_THUMBNAIL_GAP_MM = 3

/** Scales natural pixel dimensions to fit within a `maxMm` x `maxMm` box while
 * preserving aspect ratio (ticket 25): the image's longest side becomes
 * `maxMm`, the other side shorter in proportion. jsPDF's `addImage` scales
 * width and height independently, so drawing a non-square photo into a square
 * box distorts it -- sizing the box proportionally here first keeps it
 * undistorted. Falls back to a full square when dimensions are missing or
 * degenerate (a photo whose properties couldn't be read), matching the
 * pre-ticket-25 behavior rather than dropping the thumbnail. */
export function fitWithinSquare(
  naturalWidth: number,
  naturalHeight: number,
  maxMm: number,
): { width: number; height: number } {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) return { width: maxMm, height: maxMm }
  const scale = Math.min(maxMm / naturalWidth, maxMm / naturalHeight)
  return { width: naturalWidth * scale, height: naturalHeight * scale }
}

/**
 * Builds the PDF export (ticket 16): one section per entry -- Child/Food
 * heading, status/date/place line, reasons, notes, and any attached photo
 * thumbnails -- formatted for a non-technical reader (plain report layout,
 * no jargon or raw ids) rather than a data table (that's what CSV is for).
 *
 * Takes already-fetched photo data URLs rather than a `DataAccessClient`, so
 * this stays a pure, synchronous, unit-testable function -- signed-URL
 * fetching and the network round-trip to turn those into data URLs (both
 * inherently async/browser-only) happen in the caller first.
 */
export function buildExportPdf(rows: ExportRow[], photoDataUrlsByEntryId: Record<string, string[]>): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - PDF_MARGIN_MM * 2

  let cursorY = PDF_MARGIN_MM
  doc.setFontSize(16)
  doc.text('Food Sensory Tracker — Export', PDF_MARGIN_MM, cursorY)
  cursorY += PDF_LINE_HEIGHT_MM
  doc.setFontSize(10)
  doc.text(`Generated ${new Date().toLocaleString()}`, PDF_MARGIN_MM, cursorY)
  cursorY += PDF_LINE_HEIGHT_MM * 1.5

  function ensureRoomFor(blockHeight: number) {
    if (cursorY + blockHeight > pageHeight - PDF_MARGIN_MM) {
      doc.addPage()
      cursorY = PDF_MARGIN_MM
    }
  }

  if (rows.length === 0) {
    doc.setFontSize(11)
    doc.text('No entries match the current filters.', PDF_MARGIN_MM, cursorY)
    return doc
  }

  for (const row of rows) {
    doc.setFontSize(10)
    const notesLines: string[] = row.notes ? doc.splitTextToSize(`"${row.notes}"`, contentWidth) : []
    const photos = photoDataUrlsByEntryId[row.entryId] ?? []
    const photoRowHeight = photos.length > 0 ? PDF_THUMBNAIL_MM + PDF_LINE_HEIGHT_MM : 0
    const blockHeight =
      PDF_LINE_HEIGHT_MM * (2 + notesLines.length) + // header + meta/reasons + notes
      photoRowHeight +
      PDF_LINE_HEIGHT_MM // trailing spacing

    ensureRoomFor(blockHeight)

    doc.setFontSize(13)
    doc.text(formatEntryHeader(row), PDF_MARGIN_MM, cursorY)
    cursorY += PDF_LINE_HEIGHT_MM

    doc.setFontSize(10)
    doc.text(formatEntryMeta(row), PDF_MARGIN_MM, cursorY)
    cursorY += PDF_LINE_HEIGHT_MM

    if (row.reasonTagNames.length > 0) {
      doc.text(formatEntryReasons(row), PDF_MARGIN_MM, cursorY)
      cursorY += PDF_LINE_HEIGHT_MM
    }

    if (notesLines.length > 0) {
      doc.text(notesLines, PDF_MARGIN_MM, cursorY)
      cursorY += PDF_LINE_HEIGHT_MM * notesLines.length
    }

    if (photos.length > 0) {
      let photoX = PDF_MARGIN_MM
      let rowHeight = 0
      for (const dataUrl of photos) {
        // Size each thumbnail to its own aspect ratio within the square cap
        // (ticket 25) rather than stretching it to a fixed square. jsPDF
        // decodes the data URL's header synchronously, so its natural pixel
        // dimensions are available here without an async image load.
        const { width: naturalWidth, height: naturalHeight } = doc.getImageProperties(dataUrl)
        const { width, height } = fitWithinSquare(naturalWidth, naturalHeight, PDF_THUMBNAIL_MM)
        if (photoX + width > pageWidth - PDF_MARGIN_MM) break // one row of thumbnails is enough for a print-friendly layout
        doc.addImage(dataUrl, jsPdfImageFormat(dataUrl), photoX, cursorY, width, height)
        photoX += width + PDF_THUMBNAIL_GAP_MM
        rowHeight = Math.max(rowHeight, height)
      }
      // `rowHeight` <= PDF_THUMBNAIL_MM (the longest side caps at the box), so
      // the `blockHeight` estimate above (which reserves a full square) stays
      // a safe upper bound for the page-break check.
      cursorY += rowHeight + PDF_LINE_HEIGHT_MM
    }

    doc.setDrawColor(200)
    doc.line(PDF_MARGIN_MM, cursorY, pageWidth - PDF_MARGIN_MM, cursorY)
    cursorY += PDF_LINE_HEIGHT_MM
  }

  return doc
}
