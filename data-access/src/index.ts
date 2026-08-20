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
export { addCategory, addReasonTag, listCategories, listReasonTags } from "./catalog.js";
export type { Category, ReasonTag } from "./catalog.js";
export { addFood, listFoods, searchFoods } from "./foods.js";
export type { AddFoodInput, Food } from "./foods.js";
export {
  addLogEntry,
  addLogEntryPhoto,
  deleteLogEntry,
  getLogEntryPhotoUrl,
  listFilteredLogEntries,
  listFoodStatusSummary,
  listLogEntries,
  listLogEntryIdsWithPhotos,
  listLogEntryPhotos,
  MAX_PHOTOS_PER_LOG_ENTRY,
  updateLogEntry,
} from "./logEntries.js";
export type {
  AddLogEntryInput,
  AddLogEntryPhotoOptions,
  FoodStatusSummary,
  ListFilteredLogEntriesOptions,
  ListFoodStatusSummaryOptions,
  ListLogEntriesFilter,
  LogEntry,
  LogEntryPhoto,
  LogEntryStatus,
  UpdateLogEntryInput,
} from "./logEntries.js";
export { filterLogEntries } from "./filtering.js";
export type { ActiveFilters, LogEntryWithFood } from "./filtering.js";
export { findOrCreateLocation, forwardGeocode, listLocations, reverseGeocode } from "./locations.js";
export type { FindOrCreateLocationInput, Location } from "./locations.js";
export type { ForwardGeocodeMatch, ReverseGeocodeMatch } from "./mapboxClient.js";
export { buildLocationPins } from "./mapPins.js";
export type { LocationPin, PinColor } from "./mapPins.js";
export { syncQueuedEntries } from "./offlineQueue.js";
export type {
  QueuedLocationCapture,
  QueuedLogEntry,
  QueuedPhoto,
  SyncFailure,
  SyncOutcome,
  SyncSuccess,
} from "./offlineQueue.js";
