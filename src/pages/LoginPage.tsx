import { signInWithPassword } from '@food-tracker/data-access'
import { Alert, Button, Link as MuiLink, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { dataAccessClient } from '../lib/dataAccessClient'
import { useAuth } from '../lib/useAuth'

export function LoginPage() {
  const navigate = useNavigate()
  const { setIdentity } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const identity = await signInWithPassword(dataAccessClient, { email, password })
      setIdentity(identity)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Log in">
      <Stack component="form" onSubmit={handleSubmit} spacing={2} noValidate>
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
          autoComplete="current-password"
          fullWidth
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" disabled={submitting} fullWidth>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
        <Typography variant="body2">
          Don't have a household yet?{' '}
          <MuiLink component={Link} to="/signup">
            Sign up
          </MuiLink>
        </Typography>
      </Stack>
    </AuthLayout>
  )
}
