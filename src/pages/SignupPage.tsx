import { signUpAndCreateHousehold } from '@food-tracker/data-access'
import { Alert, Button, Link as MuiLink, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { dataAccessClient } from '../lib/dataAccessClient'
import { useAuth } from '../lib/useAuth'

export function SignupPage() {
  const navigate = useNavigate()
  const { setIdentity } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const identity = await signUpAndCreateHousehold(dataAccessClient, {
        email,
        password,
        displayName,
        householdName,
      })
      setIdentity(identity)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign up.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Create your household">
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
          label="Household name"
          value={householdName}
          onChange={(event) => setHouseholdName(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          fullWidth
        />
        <TextField
          label="Password"
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
          {submitting ? 'Signing up…' : 'Sign up'}
        </Button>
        <Typography variant="body2">
          Already have an account?{' '}
          <MuiLink component={Link} to="/login">
            Log in
          </MuiLink>
        </Typography>
      </Stack>
    </AuthLayout>
  )
}
