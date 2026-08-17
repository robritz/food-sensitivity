import { addChild, listChildren, type Child } from '@food-tracker/data-access'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { dataAccessClient } from '../lib/dataAccessClient'

export function ChildrenPage() {
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not add child.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main>
      <h1>Children</h1>

      {loading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!loading && !loadError && (
        <ul>
          {children.length === 0 && <li>No children yet.</li>}
          {children.map((child) => (
            <li key={child.id}>
              {child.name} — {child.birthdate}
            </li>
          ))}
        </ul>
      )}

      <h2>Add a child</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Birthdate
          <input
            type="date"
            value={birthdate}
            onChange={(event) => setBirthdate(event.target.value)}
            required
          />
        </label>
        {submitError && <p role="alert">{submitError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add child'}
        </button>
      </form>

      <p>
        <Link to="/">Back home</Link>
      </p>
    </main>
  )
}
