import {
  updateLogEntry,
  type LogEntry,
  type LogEntryStatus,
  type ReasonTag,
} from '@food-tracker/data-access'
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { dataAccessClient } from '../../lib/dataAccessClient'
import { statusLabel, STATUSES } from './logHelpers'

/** Edit dialog for an existing entry (ticket 15). Owns its own draft state,
 * seeded from `entry` each time it opens, and persists via `updateLogEntry`
 * itself -- the coordinator only supplies the entry and the reason-tag
 * vocabulary, and hears back the updated entry via `onSaved`. */
export function EditEntryDialog({
  entry,
  reasonTags,
  onClose,
  onSaved,
}: {
  entry: LogEntry | null
  reasonTags: ReasonTag[]
  onClose: () => void
  onSaved: (updated: LogEntry) => void
}) {
  const [status, setStatus] = useState<LogEntryStatus>('liked')
  const [reasonTagIds, setReasonTagIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entry) return
    setStatus(entry.status)
    setReasonTagIds(entry.reasonTagIds)
    setNotes(entry.notes ?? '')
    setError(null)
  }, [entry])

  function toggleReasonTag(id: string) {
    setReasonTagIds((current) => (current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]))
  }

  function handleClose() {
    if (saving) return
    onClose()
  }

  async function handleSave() {
    if (!entry) return
    setError(null)
    setSaving(true)
    try {
      const updated = await updateLogEntry(dataAccessClient, entry.id, {
        status,
        reasonTagIds,
        notes: notes.trim() === '' ? null : notes,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={entry !== null} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit entry</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Status</FormLabel>
            <RadioGroup row value={status} onChange={(event) => setStatus(event.target.value as LogEntryStatus)}>
              {STATUSES.map((option) => (
                <FormControlLabel key={option} value={option} control={<Radio />} label={statusLabel(option)} />
              ))}
            </RadioGroup>
          </FormControl>

          <FormControl component="fieldset">
            <FormLabel component="legend">Reasons</FormLabel>
            <FormGroup row>
              {reasonTags.map((tag) => (
                <FormControlLabel
                  key={tag.id}
                  control={<Checkbox checked={reasonTagIds.includes(tag.id)} onChange={() => toggleReasonTag(tag.id)} />}
                  label={tag.name}
                />
              ))}
            </FormGroup>
          </FormControl>

          <TextField
            label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || reasonTagIds.length === 0}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
