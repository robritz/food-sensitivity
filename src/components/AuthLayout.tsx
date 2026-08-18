import { Box, Container, Paper, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Container maxWidth="xs">
        <Paper elevation={2} sx={{ p: 4 }}>
          <Typography variant="h5" component="h1" gutterBottom>
            {title}
          </Typography>
          {children}
        </Paper>
      </Container>
    </Box>
  )
}
