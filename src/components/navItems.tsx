import ChildCareIcon from '@mui/icons-material/ChildCare'
import ListAltIcon from '@mui/icons-material/ListAlt'
import MapIcon from '@mui/icons-material/Map'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import RestaurantIcon from '@mui/icons-material/Restaurant'
import type { ReactNode } from 'react'

export interface NavItem {
  label: string
  to: string
  icon: ReactNode
}

/** The single source of truth for the global hamburger navigation (see
 * `AppLayout`). Order matters: the first item is the app's home/landing
 * destination -- the Map lives at `/` (ticket 23). */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Map', to: '/', icon: <MapIcon /> },
  { label: 'Food log', to: '/log', icon: <RestaurantIcon /> },
  { label: 'Browse foods', to: '/browse', icon: <ListAltIcon /> },
  { label: 'Children', to: '/children', icon: <ChildCareIcon /> },
  { label: 'Invite a caregiver', to: '/invite', icon: <PersonAddIcon /> },
]

/** Whether the nav item pointing at `itemTo` should be highlighted while the
 * router is at `pathname`. Home (`/`) only matches exactly so it isn't lit up
 * on every page; other routes also match their nested sub-paths. */
export function isNavItemActive(itemTo: string, pathname: string): boolean {
  if (itemTo === '/') return pathname === '/'
  return pathname === itemTo || pathname.startsWith(`${itemTo}/`)
}
