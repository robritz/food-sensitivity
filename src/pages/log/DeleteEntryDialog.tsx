import { deleteLogEntry, type Child, type Food, type LogEntry } from '@food-tracker/data-access'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { dataAccessClient } from '../../lib/dataAccessClient'
import { nameById } from '../../lib/entryFormatting'

/** Delete-confirmation dialog (ticket 15). Owns its in-flight/error state and
 * performs the delete itself, reporting the removed id back via `onDeleted`. */
export function DeleteEntryDialog({
  entry,
  childProfiles,
  foods,
  onClose,
  onDeleted,
}: {
  entry: LogEntry | null
  childProfiles: Child[]
  foods: Food[]
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (entry) setError(null)
  }, [entry])

  function handleClose() {
    if (deleting) return
    onClose()
  }

  async function handleConfirm() {
    if (!entry) return
    setError(null)
    setDeleting(true)
    try {
      await deleteLogEntry(dataAccessClient, entry.id)
      onDeleted(entry.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete entry.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={entry !== null} onClose={handleClose}>
      <DialogTitle>Delete entry?</DialogTitle>
      <DialogContent>
        <Typography>
          This removes the entry for{' '}
          {entry ? `${nameById(childProfiles, entry.childId)} — ${nameById(foods, entry.foodId)}` : ''} permanently. This
          can't be undone.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={deleting}>
          Cancel
        </Button>
        <Button color="error" variant="contained" onClick={handleConfirm} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
