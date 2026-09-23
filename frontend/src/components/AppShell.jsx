import { AppBar, Avatar, Button, Toolbar } from '@mui/material'
import LogoutIcon from '@mui/icons-material/Logout'
import { Link as RouterLink, Outlet, useNavigate } from 'react-router-dom'
import BrandMark from './BrandMark'
import { useAuth } from '../context/AuthContext'
import './AppShell.css'

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
    <div className="app-shell">
      <AppBar position="static" elevation={0}>
        <Toolbar className="app-shell__toolbar">
          <BrandMark variant="compact" />
          <div className="app-shell__user">
            <RouterLink to="/" className="app-shell__home-link" aria-label="Back to dashboard">
              <div className="app-shell__user-info">
                <p className="app-shell__user-name">{user?.name}</p>
                <p className="app-shell__user-role">{ROLE_LABELS[role] || role}</p>
              </div>
              <Avatar className="app-shell__avatar">{user?.name?.charAt(0)?.toUpperCase() || '?'}</Avatar>
            </RouterLink>
            <Button onClick={handleLogout} startIcon={<LogoutIcon />} size="small" className="app-shell__logout">
              Logout
            </Button>
          </div>
        </Toolbar>
      </AppBar>
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  )
}
