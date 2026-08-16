import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";
import { loadServiceRoleEnv, loadSupabaseEnv } from "./env.js";

export type DataAccessClient = SupabaseClient<Database>;

/**
 * The client every feature ticket should use. Requests are made as the
 * signed-in caller, so Postgres RLS scopes reads/writes to their household.
 */
export function createDataAccessClient(): DataAccessClient {
  const { url, anonKey } = loadSupabaseEnv();
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
