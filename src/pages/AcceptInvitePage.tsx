import { acceptHouseholdInvite } from '@food-tracker/data-access'
import { Alert, Button, Stack, TextField } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { dataAccessClient } from '../lib/dataAccessClient'
import { useAuth } from '../lib/useAuth'

/**
 * Landed on after following a household invite email's link -- Supabase's
 * client detects the session from the URL automatically. Not wrapped in
 * `RequireAuth`: the invitee has an auth session at this point but no
 * caregiver row yet, so `useAuth().identity` is still null.
 */
export function AcceptInvitePage() {
  const navigate = useNavigate()
  const { setIdentity } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: passwordError } = await dataAccessClient.auth.updateUser({ password })
      if (passwordError) throw passwordError

      const identity = await acceptHouseholdInvite(dataAccessClient, { displayName })
      setIdentity(identity)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Join your household">
      <Stack component="form" onSubmit={handleSubmit} spacing={2} noValidate>
        <TextField
          label="Your name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          autoComplete="name"
          fullWidth
        />
        <TextField
          label="Choose a password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          slotProps={{ htmlInput: { minLength: 6 } }}
          autoComplete="new-password"
          fullWidth
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" disabled={submitting} fullWidth>
          {submitting ? 'Joining…' : 'Join household'}
        </Button>
      </Stack>
    </AuthLayout>
  )
}
