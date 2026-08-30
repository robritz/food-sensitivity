import { useState } from 'react'

export interface NamedOption {
  id: string
  name: string
}

export type FreeSoloPicker<T extends NamedOption> = ReturnType<typeof useFreeSoloPicker<T>>

/** Manages the value/inputValue pair for a freeSolo MUI Autocomplete backed
 * by named options (Food, Category): typing updates the free-typed text and
 * clears the selection; picking an option syncs both. Ignores MUI's own
 * 'reset' notification (fired e.g. on blur) -- it would otherwise wipe out
 * free-typed text that hasn't matched an option; selecting an option updates
 * the displayed text via onChange instead. */
export function useFreeSoloPicker<T extends NamedOption>() {
  const [value, setValue] = useState<T | null>(null)
  const [inputValue, setInputValue] = useState('')

  return {
    value,
    inputValue,
    setValue,
    setInputValue,
    autocompleteProps: {
      value,
      inputValue,
      getOptionLabel: (option: T | string) => (typeof option === 'string' ? option : option.name),
      isOptionEqualToValue: (option: T | string, val: T | string) =>
        typeof option !== 'string' && typeof val !== 'string' && option.id === val.id,
      onInputChange: (_event: unknown, newInputValue: string, reason: string) => {
        if (reason === 'reset') return
        setInputValue(newInputValue)
        if (reason === 'input') setValue(null)
      },
      onChange: (_event: unknown, newValue: T | string | null) => {
        if (newValue && typeof newValue !== 'string') {
          setValue(newValue)
          setInputValue(newValue.name)
        } else {
          setValue(null)
        }
      },
    },
  }
}
