import { inviteCaregiverByEmail } from '@food-tracker/data-access'
import { Alert, Button, Stack, TextField } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { AppLayout } from '../components/AppLayout'
import { dataAccessClient } from '../lib/dataAccessClient'

export function InviteCaregiverPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await inviteCaregiverByEmail(dataAccessClient, {
        email,
        redirectTo: `${window.location.origin}/accept-invite`,
      })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppLayout title="Invite a caregiver">
      {sent ? (
        <Alert severity="success">Invite sent to {email}.</Alert>
      ) : (
        <Stack component="form" onSubmit={handleSubmit} spacing={2} noValidate>
          <TextField
            label="Their email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send invite'}
          </Button>
        </Stack>
      )}
    </AppLayout>
  )
}
