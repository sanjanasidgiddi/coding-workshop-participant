import { useState } from 'react'
import { Alert, Button, Link as MuiLink, Paper, TextField } from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import BrandMark from '../../components/BrandMark'
import { useAuth } from '../../context/AuthContext'
import './AuthPage.css'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      // Always land on "/" and let HomeRedirect route by role, rather than
      // returning to a route-router "from" location: that state can be
      // left over from a *previous* user's session in the same tab (e.g.
      // one person's expired-session redirect state leaking into the next
      // person's login) and send someone straight to a ticket that isn't
      // theirs.
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <Paper elevation={0} variant="outlined" className="auth-page__card">
        <div className="auth-page__brand">
          <BrandMark variant="full" align="center" />
        </div>

        {error && (
          <Alert severity="error" className="auth-page__error">
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email"
            type="email"
            fullWidth
            required
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            required
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            className="auth-page__submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <p className="auth-page__footer">
          Don&apos;t have an account?{' '}
          <MuiLink component={RouterLink} to="/register">
            Register
          </MuiLink>
        </p>
      </Paper>
    </div>
  )
}
