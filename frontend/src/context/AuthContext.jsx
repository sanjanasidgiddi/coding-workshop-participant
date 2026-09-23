import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { getCurrentUser, loginUser } from '../services/authService'
import { setUnauthorizedHandler } from '../services/apiClient'

const AuthContext = createContext(null)
const TOKEN_STORAGE_KEY = 'acme_access_token'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY))
  const [user, setUser] = useState(null)
  // No stored token means there's nothing to restore, so skip 'loading' entirely.
  const [status, setStatus] = useState(() => (localStorage.getItem(TOKEN_STORAGE_KEY) ? 'loading' : 'ready'))

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Restore the session from a token already in localStorage, i.e. a page
  // refresh. This runs once on mount only: an interactive login() sets
  // `user` directly from POST /login's response below and must not trigger
  // a redundant GET /me call.
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!storedToken) {
      return
    }
    getCurrentUser(storedToken)
      .then(({ user: restoredUser }) => setUser(restoredUser))
      .catch(() => clearAuth())
      .finally(() => setStatus('ready'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(clearAuth)
  }, [clearAuth])

  const login = useCallback(async (email, password) => {
    const { access_token: newToken, user: loggedInUser } = await loginUser({ email, password })
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken)
    setToken(newToken)
    setUser(loggedInUser)
    return loggedInUser
  }, [])

  const logout = useCallback(() => {
    clearAuth()
  }, [clearAuth])

  const value = {
    token,
    user,
    role: user?.role ?? null,
    isAuthenticated: Boolean(user),
    isLoading: status === 'loading',
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook are colocated by convention
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
