export {
  createDataAccessClient,
  createServiceRoleClient,
  type DataAccessClient,
} from "./client.js";
export { loadServiceRoleEnv, loadSupabaseEnv, normalizeSupabaseUrl } from "./env.js";
export type { ServiceRoleEnv, SupabaseEnv } from "./env.js";
export type { Database } from "./database.types.js";
export {
  getCurrentCaregiver,
  signInWithPassword,
  signOut,
  signUpAndCreateHousehold,
} from "./auth.js";
export type { CaregiverIdentity, SignInInput, SignUpAndCreateHouseholdInput } from "./auth.js";
export { acceptHouseholdInvite, inviteCaregiverByEmail } from "./invites.js";
export type { AcceptHouseholdInviteInput, InviteCaregiverInput } from "./invites.js";
export { addChild, listChildren } from "./children.js";
export type { AddChildInput, Child } from "./children.js";
