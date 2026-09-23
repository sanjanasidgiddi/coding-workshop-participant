import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import DashboardHome from './DashboardHome'

/** Sends roles that have a dedicated dashboard there; others see the placeholder. */
export default function HomeRedirect() {
  const { role } = useAuth()

  if (role === 'EMPLOYEE') {
    return <Navigate to="/employee" replace />
  }

  if (role === 'ENGINEER') {
    return <Navigate to="/engineer" replace />
  }

  if (role === 'FACILITY_ADMIN') {
    return <Navigate to="/admin" replace />
  }

  return <DashboardHome />
}
