import { useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Button, FormControl, InputLabel, MenuItem, Paper, Select, TextField } from '@mui/material'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { listEngineers } from '../services/authService'
import { updateIncident } from '../services/incidentsService'
import { formatEnumLabel } from '../utils/format'
import './IncidentActions.css'

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const ENGINEER_STATUS_OPTIONS = ['IN_PROGRESS', 'BLOCKED', 'RESOLVED']

/**
 * Role-specific incident actions. Reaching this page at all already proves
 * the caller has the right role/assignment for it (the backend 403s
 * otherwise) - except FACILITY_ADMIN, which can view every incident but
 * only mutate ones belonging to a building it owns (`incident.owned_by_me`,
 * computed server-side). For a non-owned incident, admin mutation controls
 * are not rendered at all (not just disabled) - the backend still 403s a
 * direct API attempt regardless.
 */
export default function IncidentActions({ incident, role, onUpdated }) {
  const { token } = useAuth()
  const [priority, setPriority] = useState(incident.priority)
  const [engineerId, setEngineerId] = useState(incident.assigned_engineer_id || '')
  const [status, setStatus] = useState('')
  const [blockedReason, setBlockedReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isOwnedAdmin = role === 'FACILITY_ADMIN' && incident.owned_by_me

  const { data: engineersData, loading: engineersLoading, error: engineersError } = useAsync(
    () => (isOwnedAdmin ? listEngineers(token) : Promise.resolve({ engineers: [] })),
    [token, isOwnedAdmin],
  )
  const engineers = engineersData?.engineers || []

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

  if (role === 'FACILITY_ADMIN' && !isOwnedAdmin) {
    return (
      <Paper variant="outlined" className="incident-actions">
        <p className="incident-actions__title">Admin Actions</p>
        <p className="incident-actions__owner-note">Managed by another admin</p>
      </Paper>
    )
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
        {engineersError && (
          <Alert severity="warning" className="incident-actions__alert">
            Could not load engineers: {engineersError}
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
          <Button
            variant="outlined"
            disabled={submitting || priority === incident.priority}
            onClick={() => runUpdate({ priority })}
          >
            Update Priority
          </Button>
        </div>

        <div className="incident-actions__row">
          <FormControl size="small" className="incident-actions__control" disabled={engineersLoading}>
            <InputLabel id="admin-engineer-label">Assigned Engineer</InputLabel>
            <Select
              labelId="admin-engineer-label"
              label="Assigned Engineer"
              value={engineerId}
              onChange={(e) => setEngineerId(e.target.value)}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {engineers.map((engineer) => (
                <MenuItem key={engineer.id} value={engineer.id}>
                  {engineer.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            disabled={submitting || !engineerId || engineerId === incident.assigned_engineer_id}
            onClick={() => runUpdate({ assigned_engineer_id: engineerId })}
          >
            Assign Engineer
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

  if (role === 'ENGINEER' && incident.status === 'CLOSED') {
    return (
      <Paper variant="outlined" className="incident-actions">
        <p className="incident-actions__title">Update Status</p>
        <p className="incident-actions__owner-note">This incident is closed and can no longer be updated.</p>
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
