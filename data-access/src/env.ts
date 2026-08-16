export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export interface ServiceRoleEnv extends SupabaseEnv {
  serviceRoleKey: string;
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Connection config for the anon (caller-scoped, RLS-enforced) client. */
export function loadSupabaseEnv(): SupabaseEnv {
  return {
    url: readEnv("SUPABASE_URL"),
    anonKey: readEnv("SUPABASE_ANON_KEY"),
  };
}

/**
 * Connection config for the service-role client. This key bypasses RLS, so
 * it must only be used server-side (admin scripts, tests) -- never shipped
 * to a browser or mobile client.
 */
export function loadServiceRoleEnv(): ServiceRoleEnv {
  return {
    ...loadSupabaseEnv(),
    serviceRoleKey: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
