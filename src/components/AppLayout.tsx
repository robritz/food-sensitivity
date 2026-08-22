import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import { signOut } from '@food-tracker/data-access'
import {
  AppBar,
  Box,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import { type ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { dataAccessClient } from '../lib/dataAccessClient'
import { useAuth } from '../lib/useAuth'
import { isNavItemActive, NAV_ITEMS } from './navItems'

export function AppLayout({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { identity, setIdentity } = useAuth()
  const [navOpen, setNavOpen] = useState(false)

  async function handleSignOut() {
    setNavOpen(false)
    await signOut(dataAccessClient)
    setIdentity(null)
    navigate('/login')
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky">
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
            sx={{ mr: 1 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          <IconButton color="inherit" aria-label="Sign out" onClick={handleSignOut}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer anchor="left" open={navOpen} onClose={() => setNavOpen(false)}>
        <Box sx={{ width: 260 }} role="presentation">
          {identity && (
            <Box sx={{ px: 2, py: 2 }}>
              <Typography variant="subtitle1" component="p">
                {identity.displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {identity.householdName}
              </Typography>
            </Box>
          )}
          <Divider />
          <List>
            {NAV_ITEMS.map((item) => (
              <ListItemButton
                key={item.to}
                component={Link}
                to={item.to}
                selected={isNavItemActive(item.to, location.pathname)}
                onClick={() => setNavOpen(false)}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
          <List>
            <ListItemButton onClick={handleSignOut}>
              <ListItemIcon>
                <LogoutIcon />
              </ListItemIcon>
              <ListItemText primary="Sign out" />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        {children}
      </Container>
    </Box>
  )
}
