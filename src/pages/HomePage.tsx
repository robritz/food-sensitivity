import ChildCareIcon from '@mui/icons-material/ChildCare'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import RestaurantIcon from '@mui/icons-material/Restaurant'
import { List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { useAuth } from '../lib/useAuth'

export function HomePage() {
  const { identity } = useAuth()

  return (
    <AppLayout title="Food Sensory Tracker">
      {identity && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Signed in as {identity.displayName} — {identity.householdName}
        </Typography>
      )}
      <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
        <ListItemButton component={Link} to="/log">
          <ListItemIcon>
            <RestaurantIcon />
          </ListItemIcon>
          <ListItemText primary="Food log" />
        </ListItemButton>
        <ListItemButton component={Link} to="/children">
          <ListItemIcon>
            <ChildCareIcon />
          </ListItemIcon>
          <ListItemText primary="Children" />
        </ListItemButton>
        <ListItemButton component={Link} to="/invite">
          <ListItemIcon>
            <PersonAddIcon />
          </ListItemIcon>
          <ListItemText primary="Invite a caregiver" />
        </ListItemButton>
      </List>
    </AppLayout>
  )
}
