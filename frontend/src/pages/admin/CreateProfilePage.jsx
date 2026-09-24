import { useState } from 'react'
import {
  Alert,
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
} from '@mui/material'
import { registerUser } from '../../services/authService'
import { isValidEmail } from '../../utils/validation'
import './CreateProfilePage.css'

const ROLE_OPTIONS = [
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'FACILITY_ADMIN', label: 'Facility Admin' },
  { value: 'ENGINEER', label: 'Engineer' },
]

const EMPTY_FORM = { name: '', email: '', password: '', role: 'EMPLOYEE' }

/**
 * Admin-only profile creation, reusing the public /users/register endpoint.
 * Unlike RegisterPage, this never logs in as the newly created user and
 * never navigates away - the admin stays on this page to create more
 * profiles, and PeoplePage already refetches on every navigation so the
 * new user shows up there without any extra plumbing.
 */
export default function CreateProfilePage() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [emailError, setEmailError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
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
    setSuccess('')
    setSubmitting(true)
    try {
      await registerUser(form)
      setForm(EMPTY_FORM)
      setEmailError('')
      setSuccess('Profile created successfully.')
    } catch (err) {
      setError(err.message || 'Failed to create profile')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <p className="create-profile-page__title">Create Profile</p>

      <Paper variant="outlined" className="create-profile-page__card">
        {success && (
          <Alert severity="success" className="create-profile-page__alert">
            {success}
          </Alert>
        )}
        {error && (
          <Alert severity="error" className="create-profile-page__alert">
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
            <InputLabel id="create-profile-role-label">Role</InputLabel>
            <Select labelId="create-profile-role-label" label="Role" value={form.role} onChange={update('role')}>
              {ROLE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>Choose the role for the new account.</FormHelperText>
          </FormControl>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting}
            className="create-profile-page__submit"
          >
            {submitting ? 'Creating…' : 'Create Profile'}
          </Button>
        </form>
      </Paper>
    </div>
  )
}
