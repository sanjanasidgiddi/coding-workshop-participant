import { AppBar, Avatar, Box, Button, Stack, Toolbar, Typography } from '@mui/material'
import LogoutIcon from '@mui/icons-material/Logout'
import { Outlet, useNavigate } from 'react-router-dom'
import BrandMark from './BrandMark'
import { useAuth } from '../context/AuthContext'

const ROLE_LABELS = {
  EMPLOYEE: 'Employee',
  FACILITY_ADMIN: 'Facility Admin',
  ENGINEER: 'Engineer',
}

/** Application shell: header with branding, current user, and logout. */
export default function AppShell() {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', py: 1 }}>
          <BrandMark variant="compact" />
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                {user?.name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {ROLE_LABELS[role] || role}
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: 'secondary.main', color: 'text.primary', width: 32, height: 32, fontSize: 14 }}>
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </Avatar>
            <Button onClick={handleLogout} startIcon={<LogoutIcon />} size="small" sx={{ color: 'text.secondary' }}>
              Logout
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ p: { xs: 2, sm: 3 } }}>
        <Outlet />
      </Box>
    </Box>
  )
}
