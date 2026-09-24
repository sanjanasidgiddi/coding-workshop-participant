import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { Card, CardActionArea, CardContent } from '@mui/material'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import EngineeringOutlinedIcon from '@mui/icons-material/EngineeringOutlined'
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined'
import StatusChip from './StatusChip'
import PriorityChip from './PriorityChip'
import IncidentStatusStepper from './IncidentStatusStepper'
import { formatDateTime, formatFacility } from '../utils/format'
import './IncidentCard.css'

/**
 * Shared incident row, used by IncidentTable for every role's list
 * (employee/engineer/admin). The whole row is clickable through to the
 * incident's detail page.
 */
export default function IncidentCard({ incident, facility }) {
  const navigate = useNavigate()

  return (
    <Card variant="outlined" className="incident-card">
      <CardActionArea onClick={() => navigate(`/incidents/${incident.id}`)} className="incident-card__action">
        <CardContent className="incident-card__content">
          <div className="incident-card__top">
            <div className="incident-card__main">
              <div className="incident-card__heading">
                <p className="incident-card__title">{incident.title}</p>
                <div className="incident-card__chips">
                  <StatusChip status={incident.status} />
                  <PriorityChip priority={incident.priority} />
                </div>
              </div>

              <div className="incident-card__meta">
                <span className="incident-card__meta-item">{incident.category || 'Uncategorized'}</span>
                <span className="incident-card__meta-item incident-card__meta-item--facility">
                  <LocationOnOutlinedIcon fontSize="inherit" className="incident-card__meta-icon" />
                  {formatFacility(facility)}
                </span>
                {incident.assigned_engineer_id && (
                  <span className="incident-card__meta-item">
                    <EngineeringOutlinedIcon fontSize="inherit" className="incident-card__meta-icon" />
                    Engineer #{incident.assigned_engineer_id}
                  </span>
                )}
                <span className="incident-card__meta-item">
                  <AccessTimeOutlinedIcon fontSize="inherit" className="incident-card__meta-icon" />
                  Updated {formatDateTime(incident.updated_at)}
                </span>
              </div>
            </div>

            <div className="incident-card__footer">
              <span className="incident-card__id">#{incident.id}</span>
            </div>
          </div>

          <div className="incident-card__progress">
            <IncidentStatusStepper status={incident.status} />
          </div>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

IncidentCard.propTypes = {
  incident: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    title: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    priority: PropTypes.string.isRequired,
    category: PropTypes.string,
    assigned_engineer_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    updated_at: PropTypes.string,
  }).isRequired,
  facility: PropTypes.object,
}
