import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";
import { loadServiceRoleEnv, loadSupabaseEnv, normalizeSupabaseUrl, type SupabaseEnv } from "./env.js";

export type DataAccessClient = SupabaseClient<Database>;

/**
 * The client every feature ticket should use. Requests are made as the
 * signed-in caller, so Postgres RLS scopes reads/writes to their household.
 *
 * `env` is optional and only needed by callers that can't read
 * `process.env` (e.g. a Vite app, which exposes config via `import.meta.env`
 * instead) -- Node callers (scripts, tests) can omit it and get it from
 * `process.env` via `loadSupabaseEnv()`.
 */
export function createDataAccessClient(env?: SupabaseEnv): DataAccessClient {
  const { url, anonKey } = env
    ? { url: normalizeSupabaseUrl(env.url), anonKey: env.anonKey }
    : loadSupabaseEnv();
  return createClient<Database>(url, anonKey);
}

/**
 * Bypasses RLS entirely. Reserved for server-side admin operations and test
 * fixtures -- never expose the service role key to a browser or mobile app.
 */
export function createServiceRoleClient(): DataAccessClient {
  const { url, serviceRoleKey } = loadServiceRoleEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
