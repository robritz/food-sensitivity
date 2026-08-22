import { addChild, listChildren, type Child } from '@food-tracker/data-access'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AppLayout } from '../components/AppLayout'
import { dataAccessClient } from '../lib/dataAccessClient'

export function ChildrenPage() {
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    listChildren(dataAccessClient)
      .then((result) => {
        if (!cancelled) setChildren(result)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load children.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitError(null)
    setSubmitting(true)
    try {
      const child = await addChild(dataAccessClient, { name, birthdate })
      setChildren((current) => [...current, child].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setBirthdate('')
      // Return focus to Name so several children can be added in a row without
      // re-clicking into the field each time (autoFocus only fires on mount).
      nameInputRef.current?.focus()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not add child.')
    } finally {
      setSubmitting(false)

    }
  }

  return (
    <AppLayout title="Children">
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress />
        </Box>
      )}
      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {!loading && !loadError && (
        <List sx={{ bgcolor: 'background.paper', borderRadius: 1, mb: 3 }}>
          {children.length === 0 && (
            <ListItem>
              <ListItemText primary="No children yet." />
            </ListItem>
          )}
          {children.map((child) => (
            <ListItem key={child.id}>
              <ListItemText primary={child.name} secondary={child.birthdate} />
            </ListItem>
          ))}
        </List>
      )}

      <Typography variant="h6" component="h2" gutterBottom>
        Add a child
      </Typography>
      <Stack component="form" onSubmit={handleSubmit} spacing={2} noValidate>
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          fullWidth
          autoFocus
          inputRef={nameInputRef}
        />
        <TextField
          label="Birthdate"
          type="date"
          value={birthdate}
          onChange={(event) => setBirthdate(event.target.value)}
          required
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {submitError && <Alert severity="error">{submitError}</Alert>}
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add child'}
        </Button>
      </Stack>
    </AppLayout>
  )
}
