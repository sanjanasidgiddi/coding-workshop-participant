import PropTypes from 'prop-types'
import { CircularProgress } from '@mui/material'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './ProtectedRoute.css'

/** Gates nested routes behind authentication, and optionally by role. */
export default function ProtectedRoute({ allowedRoles = null }) {
  const { isAuthenticated, isLoading, role } = useAuth()

  if (isLoading) {
    return (
      <div className="protected-route__loading">
        <CircularProgress color="primary" />
      </div>
    )
  }

  // No `state: { from: location }` here on purpose: it previously caused a
  // real bug where one user's in-flight redirect target leaked into the
  // *next* user's login on the same tab (see LoginPage - login always goes
  // to "/" now, so this stale state would go unused anyway).
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

ProtectedRoute.propTypes = {
  allowedRoles: PropTypes.arrayOf(PropTypes.string),
}
