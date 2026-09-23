import { useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Button, FormControl, InputLabel, MenuItem, Paper, Select, TextField } from '@mui/material'
import { useAuth } from '../context/AuthContext'
import { updateIncident } from '../services/incidentsService'
import { formatEnumLabel } from '../utils/format'
import './IncidentActions.css'

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const ENGINEER_STATUS_OPTIONS = ['IN_PROGRESS', 'BLOCKED', 'RESOLVED']

/**
 * Role-specific incident actions. Reaching this page at all already proves
 * the caller has the right role/ownership for it (the backend 403s
 * otherwise), so this only needs to branch on `role` - no separate
 * "am I the assigned engineer" check is needed.
 */
export default function IncidentActions({ incident, role, onUpdated }) {
  const { token } = useAuth()
  const [priority, setPriority] = useState(incident.priority)
  const [status, setStatus] = useState('')
  const [blockedReason, setBlockedReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function runUpdate(payload) {
    setError('')
    setSubmitting(true)
    try {
      await updateIncident(token, incident.id, payload)
      onUpdated()
    } catch (err) {
      setError(err.message || 'Update failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (role === 'FACILITY_ADMIN') {
    return (
      <Paper variant="outlined" className="incident-actions">
        <p className="incident-actions__title">Admin Actions</p>
        {error && (
          <Alert severity="error" className="incident-actions__alert">
            {error}
          </Alert>
        )}

        <div className="incident-actions__row">
          <FormControl size="small" className="incident-actions__control">
            <InputLabel id="admin-priority-label">Priority</InputLabel>
            <Select
              labelId="admin-priority-label"
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {formatEnumLabel(option)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" disabled={submitting || priority === incident.priority} onClick={() => runUpdate({ priority })}>
            Update Priority
          </Button>
        </div>

        {incident.status !== 'CLOSED' && (
          <div className="incident-actions__row">
            <Button variant="contained" disabled={submitting} onClick={() => runUpdate({ status: 'CLOSED' })}>
              Close Incident
            </Button>
          </div>
        )}
      </Paper>
    )
  }

  if (role === 'ENGINEER') {
    const isBlocked = status === 'BLOCKED'
    return (
      <Paper variant="outlined" className="incident-actions">
        <p className="incident-actions__title">Update Status</p>
        {error && (
          <Alert severity="error" className="incident-actions__alert">
            {error}
          </Alert>
        )}

        <div className="incident-actions__row">
          <FormControl size="small" className="incident-actions__control">
            <InputLabel id="engineer-status-label">Status</InputLabel>
            <Select
              labelId="engineer-status-label"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {ENGINEER_STATUS_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {formatEnumLabel(option)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>

        {isBlocked && (
          <TextField
            label="Blocked reason"
            fullWidth
            required
            multiline
            minRows={2}
            value={blockedReason}
            onChange={(e) => setBlockedReason(e.target.value)}
            className="incident-actions__blocked-reason"
          />
        )}

        <Button
          variant="contained"
          className="incident-actions__submit"
          disabled={submitting || !status || (isBlocked && !blockedReason.trim())}
          onClick={() => runUpdate(isBlocked ? { status, blocked_reason: blockedReason } : { status })}
        >
          {submitting ? 'Updating…' : 'Update Status'}
        </Button>
      </Paper>
    )
  }

  return null
}

IncidentActions.propTypes = {
  incident: PropTypes.object.isRequired,
  role: PropTypes.string.isRequired,
  onUpdated: PropTypes.func.isRequired,
}
