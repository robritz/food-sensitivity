import { describe, expect, it } from 'vitest'
import { buildExportPdf, buildExportRows, entryRowsToCsv, fitWithinSquare, formatEntryHeader, formatEntryMeta, formatEntryReasons } from '../export'

// A valid 4x2 (non-square) red PNG, so the photo-layout path in buildExportPdf
// actually decodes real image bytes via jsPDF's getImageProperties.
const NON_SQUARE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGP4z8AARwzIHABvqgf5gNwAKAAAAABJRU5ErkJggg=='
import type { Category, Child, Food, Location, LogEntry, ReasonTag } from '@food-tracker/data-access'

const child: Child = { id: 'child-1', householdId: 'h1', name: 'Alex', birthdate: '2019-04-12', createdAt: '2026-01-01T00:00:00.000Z' }
const category: Category = { id: 'cat-1', householdId: null, name: 'Protein' }
const food: Food = { id: 'food-1', householdId: 'h1', categoryId: 'cat-1', name: 'Oscar Mayer Classic', createdAt: '2026-01-01T00:00:00.000Z' }
const texture: ReasonTag = { id: 'tag-1', householdId: null, name: 'Texture' }
const taste: ReasonTag = { id: 'tag-2', householdId: null, name: 'Taste' }
const home: Location = {
  id: 'loc-1',
  householdId: 'h1',
  name: 'Home',
  latitude: 40,
  longitude: -75,
  mapboxPlaceId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function baseEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'entry-1',
    householdId: 'h1',
    foodId: food.id,
    childId: child.id,
    status: 'liked',
    reasonTagIds: [texture.id],
    notes: null,
    intensity: null,
    occurredAt: '2026-02-01T12:00:00.000Z',
    locationId: null,
    createdBy: 'caregiver-1',
    createdAt: '2026-02-01T12:00:00.000Z',
    ...overrides,
  }
}

const lookups = { foods: [food], children: [child], categories: [category], reasonTags: [texture, taste], locations: [home] }

describe('buildExportRows', () => {
  it('joins an entry with its Food/Child/Category/Location/reason-tag names', () => {
    const entry = baseEntry({ reasonTagIds: [texture.id, taste.id], locationId: home.id, intensity: 3, notes: 'Loved it' })

    const [row] = buildExportRows([entry], lookups)

    expect(row).toMatchObject({
      childName: 'Alex',
      foodName: 'Oscar Mayer Classic',
      categoryName: 'Protein',
      status: 'liked',
      intensity: 3,
      locationName: 'Home',
      reasonTagNames: ['Texture', 'Taste'],
      notes: 'Loved it',
    })
  })

  it('falls back to "Unknown" for a Food/Child not present in the lookups', () => {
    const entry = baseEntry({ foodId: 'missing-food', childId: 'missing-child' })

    const [row] = buildExportRows([entry], lookups)

    expect(row.foodName).toBe('Unknown')
    expect(row.childName).toBe('Unknown')
  })

  it('reports no location/notes as empty rather than throwing', () => {
    const entry = baseEntry({ locationId: null, notes: null, intensity: null })

    const [row] = buildExportRows([entry], lookups)

    expect(row.locationName).toBe('')
    expect(row.notes).toBe('')
    expect(row.intensity).toBeNull()
  })
})

describe('entryRowsToCsv', () => {
  it('renders a header row plus one row per entry, comma-joining multiple reasons', () => {
    const entry = baseEntry({ reasonTagIds: [texture.id, taste.id], locationId: home.id, intensity: 4 })
    const [row] = buildExportRows([entry], lookups)

    const csv = entryRowsToCsv([row])
    const lines = csv.trim().split('\r\n')

    expect(lines[0]).toBe('Child,Food,Category,Status,Intensity,Date,Location,Reasons,Notes')
    expect(lines[1]).toBe('Alex,Oscar Mayer Classic,Protein,liked,4,2026-02-01T12:00:00.000Z,Home,"Texture, Taste",')
  })

  it('quotes and escapes fields containing commas, quotes, or newlines', () => {
    const entry = baseEntry({ notes: 'Said "yum", then cried\nlater' })
    const [row] = buildExportRows([entry], lookups)

    const csv = entryRowsToCsv([row])
    const lines = csv.trim().split('\r\n')

    expect(lines[1]).toContain('"Said ""yum"", then cried\nlater"')
  })

  it('produces just the header for an empty entry list', () => {
    expect(entryRowsToCsv([]).trim()).toBe('Child,Food,Category,Status,Intensity,Date,Location,Reasons,Notes')
  })
})

describe('formatEntryHeader / formatEntryMeta / formatEntryReasons', () => {
  it('formats the header as "Child — Food"', () => {
    const [row] = buildExportRows([baseEntry()], lookups)
    expect(formatEntryHeader(row)).toBe('Alex — Oscar Mayer Classic')
  })

  it('includes category, capitalized status, intensity, and location when present', () => {
    const entry = baseEntry({ intensity: 4, locationId: home.id })
    const [row] = buildExportRows([entry], lookups)

    const meta = formatEntryMeta(row)

    expect(meta).toContain('Protein')
    expect(meta).toContain('Liked')
    expect(meta).toContain('Intensity 4/5')
    expect(meta).toContain('Home')
  })

  it('omits intensity and location when neither is set', () => {
    const [row] = buildExportRows([baseEntry({ intensity: null, locationId: null })], lookups)

    const meta = formatEntryMeta(row)

    expect(meta).not.toContain('Intensity')
    expect(meta).not.toContain('Home')
  })

  it('comma-joins reason tag names with a "Reasons:" prefix', () => {
    const entry = baseEntry({ reasonTagIds: [texture.id, taste.id] })
    const [row] = buildExportRows([entry], lookups)

    expect(formatEntryReasons(row)).toBe('Reasons: Texture, Taste')
  })
})

describe('fitWithinSquare', () => {
  it('leaves a square image square, sized to the box', () => {
    const { width, height } = fitWithinSquare(100, 100, 28)
    expect(width).toBeCloseTo(28)
    expect(height).toBeCloseTo(28)
  })

  it('scales a landscape image so its longest side fills the box, preserving ratio', () => {
    const { width, height } = fitWithinSquare(200, 100, 28)
    expect(width).toBeCloseTo(28)
    expect(height).toBeCloseTo(14)
    expect(width / height).toBeCloseTo(200 / 100)
  })

  it('scales a portrait image the same way', () => {
    const { width, height } = fitWithinSquare(100, 200, 28)
    expect(width).toBeCloseTo(14)
    expect(height).toBeCloseTo(28)
    expect(width / height).toBeCloseTo(100 / 200)
  })

  it('never exceeds the box on either side', () => {
    const { width, height } = fitWithinSquare(1000, 250, 28)
    expect(width).toBeLessThanOrEqual(28)
    expect(height).toBeLessThanOrEqual(28)
  })

  it('falls back to a full square when dimensions are missing/degenerate', () => {
    expect(fitWithinSquare(0, 0, 28)).toEqual({ width: 28, height: 28 })
    expect(fitWithinSquare(Number.NaN, 100, 28)).toEqual({ width: 28, height: 28 })
  })
})

describe('buildExportPdf', () => {
  it('produces a non-empty single-page PDF for a small entry list', () => {
    const [row] = buildExportRows([baseEntry({ intensity: 3, notes: 'Loved it' })], lookups)

    const doc = buildExportPdf([row], {})

    expect(doc.getNumberOfPages()).toBe(1)
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0)
  })

  it('renders a fallback message and stays on one page for an empty entry list', () => {
    const doc = buildExportPdf([], {})

    expect(doc.getNumberOfPages()).toBe(1)
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0)
  })

  it('embeds a real (non-square) photo without throwing, using proportional sizing', () => {
    const [row] = buildExportRows([baseEntry()], lookups)

    const doc = buildExportPdf([row], { [row.entryId]: [NON_SQUARE_PNG] })

    expect(doc.getNumberOfPages()).toBe(1)
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0)
  })

  it('paginates once enough entries overflow the first page', () => {
    const rows = buildExportRows(
      Array.from({ length: 40 }, (_, i) =>
        baseEntry({ id: `entry-${i}`, notes: `Note number ${i} with some extra detail to take up space` }),
      ),
      lookups,
    )

    const doc = buildExportPdf(rows, {})

    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })
})
