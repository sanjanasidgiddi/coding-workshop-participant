import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import BrandMark from '../../components/BrandMark'
import { registerUser } from '../../services/authService'
import { useAuth } from '../../context/AuthContext'

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
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
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
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper elevation={0} variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 420 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <BrandMark variant="full" align="center" />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
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
            onChange={update('email')}
            autoComplete="email"
            helperText="Must be an @acme.inc address"
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
          <Button type="submit" variant="contained" fullWidth size="large" sx={{ mt: 3 }} disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create Account'}
          </Button>
        </Box>

        <Typography variant="body2" sx={{ mt: 3, textAlign: 'center', color: 'text.secondary' }}>
          Already have an account?{' '}
          <MuiLink component={RouterLink} to="/login">
            Sign In
          </MuiLink>
        </Typography>
      </Paper>
    </Box>
  )
}
