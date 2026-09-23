import { useState } from 'react'
import {
  Alert,
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Paper,
  Select,
  TextField,
} from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import BrandMark from '../../components/BrandMark'
import { registerUser } from '../../services/authService'
import { useAuth } from '../../context/AuthContext'
import { isValidEmail } from '../../utils/validation'
import './AuthPage.css'

// Workshop/demo simplicity only: letting anyone self-register as
// FACILITY_ADMIN or ENGINEER is not something a real product would do.
// In production, EMPLOYEE would be the only self-service role, and
// admin/engineer accounts would be provisioned by an existing admin
// (see the Phase F5 plan for an admin-only engineer-provisioning endpoint).
const ROLE_OPTIONS = [
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'FACILITY_ADMIN', label: 'Facility Admin' },
  { value: 'ENGINEER', label: 'Engineer' },
]

export default function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'EMPLOYEE' })
  const [emailError, setEmailError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  function handleEmailChange(event) {
    update('email')(event)
    if (emailError) setEmailError('')
  }

  function handleEmailBlur() {
    setEmailError(form.email && !isValidEmail(form.email) ? 'Email address invalid' : '')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await registerUser(form)
      await login(form.email, form.password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Registration failed')
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
            label="Name"
            fullWidth
            required
            margin="normal"
            value={form.name}
            onChange={update('name')}
            autoComplete="name"
          />
          <TextField
            label="Email"
            type="email"
            fullWidth
            required
            margin="normal"
            value={form.email}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
            error={Boolean(emailError)}
            autoComplete="email"
            helperText={emailError || 'Must be an @acme.inc address'}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            required
            margin="normal"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            helperText="At least 8 characters"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel id="register-role-label">Role</InputLabel>
            <Select labelId="register-role-label" label="Role" value={form.role} onChange={update('role')}>
              {ROLE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>For this workshop, any role can self-register.</FormHelperText>
          </FormControl>
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            className="auth-page__submit"
            disabled={submitting}
          >
            {submitting ? 'Creating account…' : 'Create Account'}
          </Button>
        </form>

        <p className="auth-page__footer">
          Already have an account?{' '}
          <MuiLink component={RouterLink} to="/login">
            Sign In
          </MuiLink>
        </p>
      </Paper>
    </div>
  )
}
