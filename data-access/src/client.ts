import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";
import { loadServiceRoleEnv, loadSupabaseEnv, normalizeSupabaseUrl, type SupabaseEnv } from "./env.js";

export type DataAccessClient = SupabaseClient<Database>;

// supabase-js's default fetch has no timeout: if the Supabase project is
// unreachable (DNS black hole, server accepts the connection but never
// responds, etc.), a request -- including the background refresh_token call
// auto-refresh makes -- hangs forever rather than rejecting. Since
// AuthProvider awaits that call on every page load, an unreachable auth
// server otherwise hangs the whole app on an infinite loading spinner
// instead of falling through to a signed-out state. Bounding every request
// this client makes turns that hang into a rejection callers can catch.
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    // Aborting the caller's own signal (if any) should still abort the
    // request, not just get silently replaced by ours.
    init.signal?.addEventListener("abort", () => controller.abort(init.signal?.reason));
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
  };
}

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
  return createClient<Database>(url, anonKey, {
    global: { fetch: fetchWithTimeout(DEFAULT_FETCH_TIMEOUT_MS) },
  });
}

/**
 * Bypasses RLS entirely. Reserved for server-side admin operations and test
 * fixtures -- never expose the service role key to a browser or mobile app.
 */
export function createServiceRoleClient(): DataAccessClient {
  const { url, serviceRoleKey } = loadServiceRoleEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout(DEFAULT_FETCH_TIMEOUT_MS) },
  });
}
