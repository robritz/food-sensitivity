import type { CaregiverIdentity } from '@food-tracker/data-access'
import { createContext } from 'react'

export interface AuthState {
  identity: CaregiverIdentity | null
  loading: boolean
}

export interface AuthContextValue extends AuthState {
  /** Sign-up/log-in/sign-out already know the resulting identity -- this
   * publishes it directly instead of re-querying it, which would otherwise
   * race a fresh signup's own household/caregiver inserts. */
  setIdentity: (identity: CaregiverIdentity | null) => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
