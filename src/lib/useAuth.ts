import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './authContext'

/** The signed-in caregiver's identity, kept in sync with Supabase auth state. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
