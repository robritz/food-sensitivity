// Sends a household invite email. This has to run server-side: the only way
// to trigger Supabase Auth's invite email is `admin.inviteUserByEmail`, which
// requires the service-role key -- something the browser must never hold.
//
// Authorization for *who may invite* is delegated back to Postgres RLS: this
// function inserts the `household_invite` row using the caller's own JWT (not
// the service-role client), so the "household members can invite a caregiver
// by email" policy is what actually decides whether the request is allowed.
// The service-role client is only used for the one step that's inherently
// privileged -- sending the email itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header." }, 401);
  }

  let email: unknown;
  let redirectTo: unknown;
  try {
    const body = await req.json();
    email = body.email;
    redirectTo = body.redirectTo;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  if (typeof email !== "string" || !email.trim()) {
    return jsonResponse({ error: "email is required." }, 400);
  }

  function readEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  }
  const supabaseUrl = readEnv("SUPABASE_URL");
  const anonKey = readEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  // RLS-scoped as the caller -- this client can only do what the caller
  // themself is allowed to do.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }

  const { data: caregiver, error: caregiverError } = await callerClient
    .from("caregiver")
    .select("id, household_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (caregiverError) {
    return jsonResponse({ error: caregiverError.message }, 400);
  }
  if (!caregiver) {
    return jsonResponse({ error: "Only a caregiver in a household can send invites." }, 403);
  }

  const { error: inviteError } = await callerClient.from("household_invite").insert({
    household_id: caregiver.household_id,
    email,
    invited_by: caregiver.id,
  });
  if (inviteError) {
    return jsonResponse({ error: inviteError.message }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: sendError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: typeof redirectTo === "string" ? redirectTo : undefined,
  });
  if (sendError) {
    return jsonResponse({ error: sendError.message }, 400);
  }

  return jsonResponse({ ok: true }, 200);
});
