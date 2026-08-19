import type { PinColor } from '@food-tracker/data-access'

// Same red/yellow/green vocabulary as `buildLocationPins`' `PinColor` --
// kept here (rather than exported from data-access) since actual hex values
// are a presentation concern, not a domain one. Shared between MapPage's
// list-view swatches and InteractiveMap's markers so the two can't drift
// apart.
export const PIN_HEX: Record<PinColor, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
}
