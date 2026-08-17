import { getCurrentCaregiver, getSessionUserId, type CaregiverIdentity } from "./auth.js";
import type { DataAccessClient } from "./client.js";

export interface InviteCaregiverInput {
  email: string;
  /** Where the invite email's link should land once clicked -- typically
   * `${window.location.origin}/accept-invite`. Supabase Auth only honors
   * redirect URLs on its own allow-list (see `supabase/config.toml`), so this
   * can't be used to send the invitee anywhere else. */
  redirectTo: string;
}

/**
 * Invites another person to join the caller's household by email.
 *
 * Runs through the `invite-caregiver` Edge Function rather than calling
 * Supabase directly, because sending the actual invite email requires
 * `admin.inviteUserByEmail`, which only works with the service-role key --
 * something the browser must never hold. Authorization for *who* may invite
 * is still enforced by Postgres RLS: the function inserts the
 * `household_invite` row using the caller's own session, not a privileged
 * one.
 */
export async function inviteCaregiverByEmail(
  client: DataAccessClient,
  input: InviteCaregiverInput,
): Promise<void> {
  const { error } = await client.functions.invoke("invite-caregiver", {
    body: { email: input.email, redirectTo: input.redirectTo },
  });
  if (error) throw error;
}

export interface AcceptHouseholdInviteInput {
  displayName: string;
}

/**
 * Completes an invited caregiver's account. Expects to be called with a
 * client that already has an active session -- established by following the
 * invite link and, typically, setting a password via
 * `client.auth.updateUser({ password })` -- and joins the household that
 * invited the session's (verified) email address, never a new one.
 */
export async function acceptHouseholdInvite(
  client: DataAccessClient,
  input: AcceptHouseholdInviteInput,
): Promise<CaregiverIdentity> {
  const userId = await getSessionUserId(client);
  if (!userId) {
    throw new Error("No active session -- follow the invite link again before creating an account.");
  }

  // Ordered and limited to 1 so a caller invited by more than one household
  // deterministically joins whichever invited them most recently, rather
  // than an arbitrary row.
  const { data: invite, error: inviteError } = await client
    .from("household_invite")
    .select("household_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inviteError) throw inviteError;
  if (!invite) {
    throw new Error("No pending invite was found for this email address.");
  }

  const { error: caregiverError } = await client
    .from("caregiver")
    .insert({ household_id: invite.household_id, user_id: userId, display_name: input.displayName });
  if (caregiverError) throw caregiverError;

  const identity = await getCurrentCaregiver(client);
  if (!identity) {
    throw new Error("Caregiver row was inserted but is not readable back -- this should be unreachable.");
  }
  return identity;
}
