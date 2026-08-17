import { createDataAccessClient } from '@food-tracker/data-access'

function readEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/** The one Supabase client the app uses -- everywhere else calls into `@food-tracker/data-access`. */
export const dataAccessClient = createDataAccessClient({
  url: readEnv('VITE_SUPABASE_URL'),
  anonKey: readEnv('VITE_SUPABASE_ANON_KEY'),
})
