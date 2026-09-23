import { Paper, Typography } from '@mui/material'
import { useAuth } from '../context/AuthContext'

const ROLE_LABELS = {
  EMPLOYEE: 'an Employee',
  FACILITY_ADMIN: 'a Facility Admin',
  ENGINEER: 'an Engineer',
}

/**
 * Placeholder landing page behind auth. Replaced by the role-specific
 * dashboards (employee/engineer/admin) in later phases.
 */
export default function DashboardHome() {
  const { user, role } = useAuth()

  return (
    <Paper variant="outlined" sx={{ p: 4, maxWidth: 640, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
        Welcome, {user?.name}
      </Typography>
      <Typography variant="body1" sx={{ color: 'text.secondary' }}>
        You&apos;re signed in as <strong>{ROLE_LABELS[role] || role}</strong>. The role-specific dashboard is coming
        in a later phase.
      </Typography>
    </Paper>
  )
}
