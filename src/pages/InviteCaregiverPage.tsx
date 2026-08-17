import { inviteCaregiverByEmail } from '@food-tracker/data-access'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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
    <main>
      <h1>Invite a caregiver</h1>
      {sent ? (
        <p>Invite sent to {email}.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Their email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      )}
      <p>
        <Link to="/">Back home</Link>
      </p>
    </main>
  )
}
