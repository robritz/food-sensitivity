import type { Food } from '@food-tracker/data-access'

const MAX_RESULTS = 10

/** Offline counterpart to `searchFoods` -- filters an already-loaded Food
 * list in memory instead of hitting the network, mirroring the server-side
 * case-insensitive substring match and 10-result cap so the offline picker
 * behaves the same as the online one. */
export function filterFoodsOffline(foods: Food[], query: string): Food[] {
  const lowerQuery = query.toLowerCase()
  return foods
    .filter((food) => food.name.toLowerCase().includes(lowerQuery))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_RESULTS)
}
