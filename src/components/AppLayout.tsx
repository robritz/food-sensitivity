import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import LogoutIcon from '@mui/icons-material/Logout'
import { signOut } from '@food-tracker/data-access'
import { AppBar, Box, Container, IconButton, Toolbar, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { dataAccessClient } from '../lib/dataAccessClient'
import { useAuth } from '../lib/useAuth'

export function AppLayout({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { setIdentity } = useAuth()
  const isHome = location.pathname === '/'

  async function handleSignOut() {
    await signOut(dataAccessClient)
    setIdentity(null)
    navigate('/login')
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky">
        <Toolbar>
          {!isHome && (
            <IconButton
              edge="start"
              color="inherit"
              aria-label="Back home"
              onClick={() => navigate('/')}
              sx={{ mr: 1 }}
            >
              <ArrowBackIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          <IconButton color="inherit" aria-label="Sign out" onClick={handleSignOut}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        {children}
      </Container>
    </Box>
  )
}
