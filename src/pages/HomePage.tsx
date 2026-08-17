import { signOut } from '@food-tracker/data-access'
import { Link, useNavigate } from 'react-router-dom'
import { dataAccessClient } from '../lib/dataAccessClient'
import { useAuth } from '../lib/useAuth'

export function HomePage() {
  const { identity, setIdentity } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut(dataAccessClient)
    setIdentity(null)
    navigate('/login')
  }

  return (
    <main>
      <h1>Food Sensory Tracker</h1>
      {identity && (
        <p>
          Signed in as {identity.displayName} — {identity.householdName}
        </p>
      )}
      <p>Home placeholder — food log lands here.</p>
      <p>
        <Link to="/children">Children</Link>
      </p>
      <p>
        <Link to="/invite">Invite a caregiver</Link>
      </p>
      <button type="button" onClick={handleSignOut}>
        Sign out
      </button>
    </main>
  )
}
