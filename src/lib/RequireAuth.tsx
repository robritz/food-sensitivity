import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { identity, loading } = useAuth()

  if (loading) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    )
  }

  if (!identity) {
    return <Navigate to="/login" replace />
  }

  return children
}
