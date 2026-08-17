import { getCurrentCaregiver, type CaregiverIdentity } from '@food-tracker/data-access'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthState } from './authContext'
import { dataAccessClient } from './dataAccessClient'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ identity: null, loading: true })

  useEffect(() => {
    let cancelled = false

    getCurrentCaregiver(dataAccessClient).then((identity) => {
      if (!cancelled) setState({ identity, loading: false })
    })

    return () => {
      cancelled = true
    }
  }, [])

  const setIdentity = useCallback((identity: CaregiverIdentity | null) => {
    setState({ identity, loading: false })
  }, [])

  const value = useMemo(() => ({ ...state, setIdentity }), [state, setIdentity])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
