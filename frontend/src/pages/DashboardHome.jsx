import { Paper } from '@mui/material'
import { useAuth } from '../context/AuthContext'
import './DashboardHome.css'

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
    <Paper variant="outlined" className="dashboard-home">
      <p className="dashboard-home__title">Welcome, {user?.name}</p>
      <p className="dashboard-home__message">
        You&apos;re signed in as <strong>{ROLE_LABELS[role] || role}</strong>. The role-specific dashboard is coming
        in a later phase.
      </p>
    </Paper>
  )
}
