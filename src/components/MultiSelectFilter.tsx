import { Autocomplete, Chip, TextField } from '@mui/material'

export interface FilterOption {
  id: string
  name: string
}

/** One multi-select filter field (ticket 13): collects the chosen option ids
 * and reports them up via `onChange`. Shared by the browse list's five filter
 * types (status/category/reason/child/location) and the map's family-member
 * filter (ticket 24) rather than each page rolling its own Autocomplete.
 *
 * How multiple selected values combine (OR within a type, except child which
 * is overlap/AND -- see `ActiveFilters`) is the caller's/data-access's concern;
 * this component only gathers the selection. */
export function MultiSelectFilter({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string
  options: FilterOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const value = options.filter((option) => selectedIds.includes(option.id))
  return (
    <Autocomplete
      multiple
      size="small"
      options={options}
      value={value}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      onChange={(_event, newValue) => onChange(newValue.map((option) => option.id))}
      renderInput={(params) => <TextField {...params} label={label} />}
      renderValue={(selectedOptions, getItemProps) =>
        selectedOptions.map((option, index) => (
          <Chip size="small" label={option.name} {...getItemProps({ index })} key={option.id} />
        ))
      }
    />
  )
}
