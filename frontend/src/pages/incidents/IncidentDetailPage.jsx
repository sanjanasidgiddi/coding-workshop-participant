import { useState } from 'react'
import { Alert, CircularProgress, Divider, Paper } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
 * and the note/history thread. Laid out as a main column (summary + notes)
 * next to a sidebar (details + actions), like a production ticket view,
 * rather than one narrow stack down the middle of the page.
 */
export default function IncidentDetailPage() {
  const { id } = useParams()
  const { token, role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
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
      <button type="button" className="incident-detail__back" onClick={() => navigate(-1)}>
        <ArrowBackIcon fontSize="small" />
        Back
      </button>

      {location.state?.justCreated && (
        <Alert severity="success" className="incident-detail__banner">
          Incident created successfully.
        </Alert>
      )}

      <div className="incident-detail__layout">
        <div className="incident-detail__main">
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
          </Paper>

          <NotesSection incidentId={incident.id} canAddNote={canAddNote} />
        </div>

        <div className="incident-detail__sidebar">
          <Paper variant="outlined" className="incident-detail__facts-card">
            <p className="incident-detail__sidebar-title">Details</p>
            <dl className="incident-detail__facts">
              <div className="incident-detail__fact">
                <dt>Assigned engineer</dt>
                <dd>{incident.assigned_engineer_id ? `Engineer #${incident.assigned_engineer_id}` : 'Unassigned'}</dd>
              </div>
              <div className="incident-detail__fact">
                <dt>Created</dt>
                <dd>{formatDateTime(incident.created_at)}</dd>
              </div>
              <div className="incident-detail__fact">
                <dt>Updated</dt>
                <dd>{formatDateTime(incident.updated_at)}</dd>
              </div>
              {incident.resolved_at && (
                <div className="incident-detail__fact">
                  <dt>Resolved</dt>
                  <dd>{formatDateTime(incident.resolved_at)}</dd>
                </div>
              )}
              {incident.closed_at && (
                <div className="incident-detail__fact">
                  <dt>Closed</dt>
                  <dd>{formatDateTime(incident.closed_at)}</dd>
                </div>
              )}
            </dl>
          </Paper>

          <IncidentActions incident={incident} role={role} onUpdated={() => setRefreshKey((key) => key + 1)} />
        </div>
      </div>
    </div>
  )
}
