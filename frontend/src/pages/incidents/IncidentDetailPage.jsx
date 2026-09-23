import { useState } from 'react'
import { Alert, CircularProgress, Divider, Paper } from '@mui/material'
import { useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useFacilities } from '../../hooks/useFacilities'
import { useAsync } from '../../hooks/useAsync'
import { getIncident } from '../../services/incidentsService'
import StatusChip from '../../components/StatusChip'
import PriorityChip from '../../components/PriorityChip'
import IncidentActions from '../../components/IncidentActions'
import NotesSection from '../../components/NotesSection'
import { formatDateTime, formatFacility } from '../../utils/format'
import './IncidentDetailPage.css'

/**
 * Incident detail: read-only fields for everyone, plus a role-specific
 * action panel (admin: priority/close, engineer: status/blocked reason)
 * and the note/history thread.
 */
export default function IncidentDetailPage() {
  const { id } = useParams()
  const { token, role } = useAuth()
  const location = useLocation()
  const { facilityById } = useFacilities()
  const [refreshKey, setRefreshKey] = useState(0)

  const { data, loading, error } = useAsync(() => getIncident(token, id), [token, id, refreshKey])
  const incident = data?.incident || null

  if (loading) {
    return (
      <div className="incident-detail__loading">
        <CircularProgress />
      </div>
    )
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>
  }

  if (!incident) {
    return null
  }

  // Reaching this page at all already proves ownership/assignment/admin
  // access (the backend 403s otherwise). The one extra rule the backend
  // enforces for notes specifically is that an EMPLOYEE can't add notes
  // once their own incident is CLOSED.
  const canAddNote = role !== 'EMPLOYEE' || incident.status !== 'CLOSED'

  return (
    <div className="incident-detail">
      {location.state?.justCreated && (
        <Alert severity="success" className="incident-detail__banner">
          Incident created successfully.
        </Alert>
      )}

      <Paper variant="outlined" className="incident-detail__card">
        <div className="incident-detail__header">
          <div>
            <p className="incident-detail__title">
              #{incident.id} {incident.title}
            </p>
            <p className="incident-detail__meta">
              {incident.category || 'Uncategorized'} · {formatFacility(facilityById[incident.facility_id])}
            </p>
          </div>
          <div className="incident-detail__chips">
            <StatusChip status={incident.status} />
            <PriorityChip priority={incident.priority} />
          </div>
        </div>

        <Divider className="incident-detail__divider" />

        <p className="incident-detail__description">{incident.description || 'No description provided.'}</p>

        {incident.blocked_reason && (
          <Alert severity="warning" className="incident-detail__blocked">
            Blocked: {incident.blocked_reason}
          </Alert>
        )}

        <Divider className="incident-detail__divider" />

        <div className="incident-detail__facts">
          <p className="incident-detail__fact">
            Assigned engineer:{' '}
            {incident.assigned_engineer_id ? `Engineer #${incident.assigned_engineer_id}` : 'Unassigned'}
          </p>
          <p className="incident-detail__fact">Created: {formatDateTime(incident.created_at)}</p>
          <p className="incident-detail__fact">Updated: {formatDateTime(incident.updated_at)}</p>
          {incident.resolved_at && <p className="incident-detail__fact">Resolved: {formatDateTime(incident.resolved_at)}</p>}
          {incident.closed_at && <p className="incident-detail__fact">Closed: {formatDateTime(incident.closed_at)}</p>}
        </div>
      </Paper>

      <IncidentActions incident={incident} role={role} onUpdated={() => setRefreshKey((key) => key + 1)} />

      <NotesSection incidentId={incident.id} canAddNote={canAddNote} />
    </div>
  )
}
