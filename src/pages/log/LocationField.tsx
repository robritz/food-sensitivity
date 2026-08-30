import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt'
import { Autocomplete, Box, Button, ListItemText, TextField } from '@mui/material'
import type { LocationCapture } from './useLocationCapture'

/** Renders the opt-in Place field (tickets 10/20/21/22/28): the "Add a
 * location" button before opt-in, and the Mapbox-backed Autocomplete plus
 * "Remove location" afterward. All state/lifecycle lives in
 * `useLocationCapture`; this is purely its view. */
export function LocationField({ capture }: { capture: LocationCapture }) {
  if (!capture.enabled) {
    return (
      <Box>
        <Button variant="outlined" size="small" startIcon={<AddLocationAltIcon />} onClick={capture.enable}>
          Add a location
        </Button>
      </Box>
    )
  }

  return (
    <Box>
      <Autocomplete
        freeSolo
        filterOptions={(options) => options}
        options={capture.suggestions}
        loading={capture.loading}
        {...capture.picker.autocompleteProps}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props
          return (
            <li key={key} {...optionProps}>
              <ListItemText primary={option.name} secondary={option.placeName} />
            </li>
          )
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Place"
            helperText={
              capture.status === 'locating'
                ? 'Getting your location…'
                : capture.status === 'geocoding'
                  ? 'Looking up a name for this place…'
                  : capture.retrieveLoading
                    ? 'Getting location details…'
                    : capture.searchLoading
                      ? 'Searching nearby places…'
                      : capture.status === 'unavailable'
                        ? "Couldn't get your location -- type a place, or remove it to log without one."
                        : capture.picker.value
                          ? 'Suggested from your location -- edit if this is wrong, or remove it to log without a place.'
                          : 'Pick a suggestion to attach a location, or keep typing to log just this name.'
            }
          />
        )}
      />
      <Button size="small" onClick={capture.remove} sx={{ mt: 1 }}>
        Remove location
      </Button>
    </Box>
  )
}
