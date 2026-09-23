import { useState } from 'react'
import { Alert, Button, FormControl, InputLabel, MenuItem, Paper, Select, TextField } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import FacilitySelector from '../../components/FacilitySelector'
import { useAuth } from '../../context/AuthContext'
import { createIncident } from '../../services/incidentsService'
import './CreateIncidentPage.css'

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export default function CreateIncidentPage() {
  const { token } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ title: '', description: '', category: '', priority: 'MEDIUM', facility_id: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  function updateFacilityId(facilityId) {
    setForm((prev) => ({ ...prev, facility_id: facilityId }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // employee_id is never sent - the backend derives it from the token.
      const { incident } = await createIncident(token, {
        title: form.title,
        description: form.description || undefined,
        category: form.category || undefined,
        priority: form.priority,
        facility_id: Number(form.facility_id),
      })
      navigate(`/incidents/${incident.id}`, { replace: true, state: { justCreated: true } })
    } catch (err) {
      setError(err.message || 'Failed to create incident')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Paper variant="outlined" className="create-incident">
      <p className="create-incident__title">Create Incident</p>

      {error && (
        <Alert severity="error" className="create-incident__alert">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="create-incident__form">
        <TextField
          label="Title"
          fullWidth
          required
          value={form.title}
          onChange={update('title')}
          className="create-incident__field--full"
        />
        <TextField
          label="Description"
          fullWidth
          multiline
          minRows={3}
          value={form.description}
          onChange={update('description')}
          className="create-incident__field--full"
        />
        <TextField
          label="Category"
          fullWidth
          value={form.category}
          onChange={update('category')}
          placeholder="e.g. HVAC, Electrical, Plumbing"
        />

        <FormControl fullWidth required>
          <InputLabel id="priority-label">Priority</InputLabel>
          <Select labelId="priority-label" label="Priority" value={form.priority} onChange={update('priority')}>
            {PRIORITY_OPTIONS.map((option) => (
              <MenuItem key={option} value={option}>
                {option.charAt(0) + option.slice(1).toLowerCase()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <div className="create-incident__field--full">
          <FacilitySelector value={form.facility_id} onChange={updateFacilityId} />
        </div>

        <Button
          type="submit"
          variant="contained"
          size="large"
          className="create-incident__submit create-incident__field--full"
          disabled={submitting || !form.facility_id}
        >
          {submitting ? 'Submitting…' : 'Submit Incident'}
        </Button>
      </form>
    </Paper>
  )
}
