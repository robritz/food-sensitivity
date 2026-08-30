import {
  findOrCreateLocation,
  retrievePlace,
  reverseGeocode,
  searchPlaces,
  type QueuedLocationCapture,
} from '@food-tracker/data-access'
import { useEffect, useRef, useState } from 'react'
import { dataAccessClient } from '../../lib/dataAccessClient'
import { resolveLocationName } from '../../lib/entryFormatting'
import { useFreeSoloPicker, type NamedOption } from './useFreeSoloPicker'

const LOCATION_SEARCH_DEBOUNCE_MS = 400
const LOCATION_SUGGESTION_LIMIT = 5
const LOCATION_SEARCH_RADIUS_MILES = 5

/** A Mapbox Search Box suggestion (ticket 22), shaped as a `NamedOption` --
 * `id` is the Mapbox place id -- so it can drive a `useFreeSoloPicker`
 * Autocomplete the same way `Food`/`Category` do. `latitude`/`longitude` are
 * undefined for a freshly-picked suggestion (Search Box's `/suggest` doesn't
 * return coordinates) until `retrievePlace` resolves them -- the initial
 * GPS-based suggestion (reverse-geocoded on page load) already has them. */
export interface LocationSuggestion extends NamedOption {
  latitude?: number
  longitude?: number
  /** Full address, for disambiguating same-named suggestions (e.g. two
   * nearby chain locations) in the picklist. */
  placeName?: string
}

export type LocationStatus = 'idle' | 'locating' | 'geocoding' | 'ready' | 'unavailable'

export interface LocationCapture {
  enabled: boolean
  status: LocationStatus
  picker: ReturnType<typeof useFreeSoloPicker<LocationSuggestion>>
  suggestions: LocationSuggestion[]
  /** Combined spinner flag for the Autocomplete's `loading` prop. */
  loading: boolean
  searchLoading: boolean
  retrieveLoading: boolean
  enable: () => void
  remove: () => void
  /** Online path: reuses/creates the household Location and returns its id
   * (or undefined for "log without a place"). */
  resolveLocationId: () => Promise<string | undefined>
  /** Offline path: captures raw coordinates/name for later sync, without a
   * Supabase round-trip. */
  buildLocationCapture: () => QueuedLocationCapture | undefined
}

/** Encapsulates the whole opt-in location group (tickets 10/20/21/22/28): GPS
 * capture, reverse-geocode, the Mapbox Search Box suggest/retrieve lifecycle
 * (including its per-burst session token), and resolving the picked/typed
 * place into a Location on submit. The caller only sees a small surface --
 * `enabled`/`status`/`picker`/`suggestions`/`loading` for rendering, and
 * `resolveLocationId`/`buildLocationCapture` for the two submit paths. */
export function useLocationCapture(isOnline: boolean): LocationCapture {
  // GPS coordinates captured once per page visit (ticket 10) -- not
  // re-requested per entry, since a caregiver logging several entries in one
  // sitting is almost always still in the same place. `locationCoords` stays
  // null if permission is denied or the device has no geolocation, in which
  // case entries are simply logged without a place. Distinct from
  // `caregiverPositionRef` below: this is *the entry's* Location coordinates
  // (may end up somewhere the caregiver isn't, once they pick or type a
  // different place), not the device's raw position.
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  // Location is opt-in (ticket 28): a caregiver taps "Add a location" to
  // reveal the Place picker and (with permission) seed it from GPS. Until
  // then no place is captured or requested -- most entries are basic foods
  // where a location is just noise. `'idle'` is the pre-opt-in state; the
  // others only apply once `locationEnabled` is true.
  const [locationEnabled, setLocationEnabled] = useState(false)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle')
  // The device's raw GPS position, captured once per page visit alongside
  // `locationCoords` above but never overwritten afterward -- ticket 21's
  // Mapbox proximity bias needs "where the caregiver actually is" even after
  // `locationCoords` has moved on to a picked/typed place elsewhere. A ref,
  // not state: only read inside the search effect below, never rendered.
  const caregiverPositionRef = useRef<{ latitude: number; longitude: number } | null>(null)

  // Place field (tickets 10/20/22): a freeSolo Autocomplete over Mapbox
  // Search Box suggestions, same `useFreeSoloPicker` pattern as
  // `foodPicker`/`categoryPicker`. `locationPicker.value` is only set when a
  // suggestion was actually picked (including the initial GPS-based
  // suggestion, set directly below) -- that's what makes it eligible for
  // ticket 10's reuse-by-place-id dedup; free-typed text that never matched
  // a picked suggestion keeps `value` null, so `findOrCreateLocation` always
  // treats it as a new custom Location (ticket 20's rule, preserved) --
  // though per ticket 22, unpicked text no longer resolves coordinates at
  // all (Search Box's `/suggest` doesn't return them), so a custom Location
  // like that saves with a name but no coordinates.
  const locationPicker = useFreeSoloPicker<LocationSuggestion>()
  const { setValue: setLocationValue, setInputValue: setLocationInputValue } = locationPicker
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([])
  const [locationSearchLoading, setLocationSearchLoading] = useState(false)
  const [locationRetrieveLoading, setLocationRetrieveLoading] = useState(false)

  // One Mapbox Search Box session per suggest -> retrieve pair (its billing
  // unit): created lazily the first time a fresh typing burst searches
  // below, reused across keystrokes within that burst, and cleared back to
  // null once a pick is retrieved (or the field is emptied) so the next
  // burst gets a fresh one. A ref, not state -- only read/written inside the
  // two effects below, never rendered.
  const locationSearchSessionTokenRef = useRef<string | null>(null)

  // Resolves `locationCoords` for whatever suggestion is currently selected.
  // The initial GPS-based suggestion (set directly below, from
  // `reverseGeocode`) already has coordinates -- use them as-is. A
  // freshly-picked Search Box suggestion doesn't (`/suggest` never returns
  // them), so retrieve them via `retrievePlace` and patch the picked value
  // with the result -- that second `setLocationValue` re-triggers this
  // effect, but now with coordinates present, so it terminates after one
  // more (no-op) pass. Free-typed text (no selected value) never resolves
  // coordinates (ticket 22) -- only the search effect below handles that.
  useEffect(() => {
    const value = locationPicker.value
    if (!value) return
    if (value.latitude !== undefined && value.longitude !== undefined) {
      setLocationCoords({ latitude: value.latitude, longitude: value.longitude })
      return
    }
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
    const sessionToken = locationSearchSessionTokenRef.current
    if (!token || !sessionToken) return
    let cancelled = false
    setLocationRetrieveLoading(true)
    retrievePlace(value.id, token, sessionToken)
      .then((details) => {
        if (cancelled || locationPicker.value?.id !== value.id) return
        locationSearchSessionTokenRef.current = null
        if (details) {
          setLocationCoords({ latitude: details.latitude, longitude: details.longitude })
          setLocationValue({
            ...value,
            latitude: details.latitude,
            longitude: details.longitude,
            placeName: details.placeName ?? value.placeName,
          })
        } else {
          setLocationCoords(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLocationRetrieveLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [locationPicker.value, setLocationValue])

  // Searches Mapbox's Search Box API for places matching the typed text,
  // biased toward and hard-restricted near the caregiver's current position
  // (ticket 22 -- the classic Geocoding API ticket 21 originally used has no
  // business/POI data on this account). Debounced via the same `useEffect` +
  // `setTimeout` + cleanup idiom the food-search effect above uses, rather
  // than firing a Mapbox request per keystroke.
  useEffect(() => {
    const query = locationPicker.inputValue.trim()
    if (locationPicker.value && locationPicker.value.name === locationPicker.inputValue) return
    setLocationSuggestions([])
    setLocationCoords(null)
    if (query === '') {
      locationSearchSessionTokenRef.current = null
      return
    }
    if (!isOnline) return
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
    if (!token) return
    if (!locationSearchSessionTokenRef.current) {
      locationSearchSessionTokenRef.current = crypto.randomUUID()
    }
    const sessionToken = locationSearchSessionTokenRef.current
    let cancelled = false
    setLocationSearchLoading(true)
    const timeoutId = setTimeout(() => {
      searchPlaces(query, token, sessionToken, {
        proximity: caregiverPositionRef.current ?? undefined,
        radiusMiles: LOCATION_SEARCH_RADIUS_MILES,
        types: 'poi,address',
        limit: LOCATION_SUGGESTION_LIMIT,
      })
        .then((suggestions) => {
          if (cancelled) return
          setLocationSuggestions(
            suggestions.map((suggestion) => ({
              id: suggestion.mapboxId,
              name: suggestion.name,
              placeName: suggestion.placeName,
            })),
          )
        })
        .finally(() => {
          if (!cancelled) setLocationSearchLoading(false)
        })
    }, LOCATION_SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [locationPicker.inputValue, locationPicker.value, isOnline])

  // Captures the device's current GPS coordinates and reverse-geocodes them
  // into a suggested place name via Mapbox (ticket 10) -- but only once the
  // caregiver has opted in via "Add a location" (ticket 28), not on every
  // page load. Both steps degrade gracefully: no geolocation support, denied
  // permission, a missing VITE_MAPBOX_TOKEN, or a failed Mapbox call all just
  // leave the place field for manual typing rather than blocking entry
  // creation -- `reverseGeocode` itself already swallows Mapbox-side failures
  // and resolves to null. When permission is denied the field still renders
  // (see the 'unavailable' branch below) so a place can be typed by hand.
  useEffect(() => {
    if (!locationEnabled) return
    if (!navigator.geolocation) {
      setLocationStatus('unavailable')
      return
    }
    setLocationStatus('locating')
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        const { latitude, longitude } = position.coords
        setLocationCoords({ latitude, longitude })
        caregiverPositionRef.current = { latitude, longitude }

        const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
        if (!token) {
          setLocationStatus('ready')
          return
        }
        setLocationStatus('geocoding')
        reverseGeocode(latitude, longitude, token)
          .then((match) => {
            if (cancelled) return
            if (match) {
              setLocationValue({ id: match.mapboxPlaceId, name: match.name, latitude, longitude })
              setLocationInputValue(match.name)
            }
            setLocationStatus('ready')
          })
          .catch(() => {
            if (!cancelled) setLocationStatus('ready')
          })
      },
      () => {
        if (!cancelled) setLocationStatus('unavailable')
      },
    )
    return () => {
      cancelled = true
    }
  }, [locationEnabled, setLocationValue, setLocationInputValue])

  // Opt-in location (ticket 28): revealing the Place picker triggers the
  // GPS/reverse-geocode effect above (which is gated on `locationEnabled`).
  // Sets 'locating' up front so the field shows its spinner immediately
  // rather than flashing the idle helper text for a frame; the effect
  // corrects it to 'unavailable' if the device has no geolocation.
  function enable() {
    setLocationStatus('locating')
    setLocationEnabled(true)
  }

  // Collapses the Place picker back to the "Add a location" button and clears
  // everything it captured, so the entry logs without a place. Also resets the
  // proximity ref and Search Box session so a later re-open starts fresh.
  function remove() {
    setLocationEnabled(false)
    setLocationStatus('idle')
    setLocationCoords(null)
    caregiverPositionRef.current = null
    locationSearchSessionTokenRef.current = null
    setLocationValue(null)
    setLocationInputValue('')
    setLocationSuggestions([])
  }

  // `findOrCreateLocation` handles reuse -- passing the same mapboxPlaceId
  // again reuses the existing household Location instead of duplicating it.
  // `locationPicker.value` is only set when a suggestion was actually
  // picked (ticket 10/21), never from ticket 20's silent forward-geocode
  // fallback -- so free-typed text that merely happens to resolve to
  // coordinates still creates a new custom Location, not a dedup reuse.
  async function resolveLocationId(): Promise<string | undefined> {
    const name = resolveLocationName(locationCoords, locationPicker.inputValue)
    if (name === undefined || !locationCoords) return undefined
    const location = await findOrCreateLocation(dataAccessClient, {
      name,
      latitude: locationCoords.latitude,
      longitude: locationCoords.longitude,
      mapboxPlaceId: locationPicker.value?.id ?? null,
    })
    return location.id
  }

  // The offline counterpart of `resolveLocationId`: same "no coords or no
  // name means logging without a place" rule (via `resolveLocationName`),
  // but never calls `findOrCreateLocation` (a Supabase round-trip) -- that's
  // deferred to sync time, once `syncQueuedEntries` actually has a
  // connection to use. Generates its own `id` (rather than leaving it for
  // `findOrCreateLocation` to assign one at sync time) so a retried sync
  // attempt resolves to the same Location row instead of creating a second
  // one -- see `FindOrCreateLocationInput.id`.
  function buildLocationCapture(): QueuedLocationCapture | undefined {
    const name = resolveLocationName(locationCoords, locationPicker.inputValue)
    if (name === undefined || !locationCoords) return undefined
    return {
      id: crypto.randomUUID(),
      name,
      latitude: locationCoords.latitude,
      longitude: locationCoords.longitude,
      mapboxPlaceId: locationPicker.value?.id ?? null,
    }
  }

  return {
    enabled: locationEnabled,
    status: locationStatus,
    picker: locationPicker,
    suggestions: locationSuggestions,
    loading:
      locationStatus === 'locating' ||
      locationStatus === 'geocoding' ||
      locationSearchLoading ||
      locationRetrieveLoading,
    searchLoading: locationSearchLoading,
    retrieveLoading: locationRetrieveLoading,
    enable,
    remove,
    resolveLocationId,
    buildLocationCapture,
  }
}
