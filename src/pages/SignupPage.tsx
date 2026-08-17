import { signUpAndCreateHousehold } from '@food-tracker/data-access'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
    <main>
      <h1>Create your household</h1>
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
          Household name
          <input
            type="text"
            value={householdName}
            onChange={(event) => setHouseholdName(event.target.value)}
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
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
          {submitting ? 'Signing up…' : 'Sign up'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  )
}
