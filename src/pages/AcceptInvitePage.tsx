import { acceptHouseholdInvite } from '@food-tracker/data-access'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
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
    <main>
      <h1>Join your household</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Your name
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            autoComplete="name"
          />
        </label>
        <label>
          Choose a password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Joining…' : 'Join household'}
        </button>
      </form>
    </main>
  )
}
