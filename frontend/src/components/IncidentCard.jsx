import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { Card, CardActionArea, CardContent } from '@mui/material'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import EngineeringOutlinedIcon from '@mui/icons-material/EngineeringOutlined'
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import StatusChip from './StatusChip'
import PriorityChip from './PriorityChip'
import { formatDateTime, formatFacility } from '../utils/format'
import './IncidentCard.css'

/**
 * Shared incident card, used by IncidentTable for every role's list
 * (employee/engineer/admin). The whole card is clickable through to the
 * incident's detail page.
 */
export default function IncidentCard({ incident, facility }) {
  const navigate = useNavigate()

  return (
    <Card variant="outlined" className="incident-card">
      <CardActionArea onClick={() => navigate(`/incidents/${incident.id}`)} className="incident-card__action">
        <CardContent className="incident-card__content">
          <div className="incident-card__chips">
            <StatusChip status={incident.status} />
            <PriorityChip priority={incident.priority} />
          </div>

          <p className="incident-card__title">{incident.title}</p>
          <p className="incident-card__category">{incident.category || 'Uncategorized'}</p>

          <div className="incident-card__meta">
            <div className="incident-card__meta-row">
              <LocationOnOutlinedIcon fontSize="small" className="incident-card__meta-icon" />
              <span>{formatFacility(facility)}</span>
            </div>
            {incident.assigned_engineer_id && (
              <div className="incident-card__meta-row">
                <EngineeringOutlinedIcon fontSize="small" className="incident-card__meta-icon" />
                <span>Engineer #{incident.assigned_engineer_id}</span>
              </div>
            )}
            <div className="incident-card__meta-row incident-card__meta-row--full">
              <AccessTimeOutlinedIcon fontSize="small" className="incident-card__meta-icon" />
              <span>Updated {formatDateTime(incident.updated_at)}</span>
            </div>
          </div>

          <div className="incident-card__footer">
            <span className="incident-card__id">#{incident.id}</span>
            <span className="incident-card__link">
              View Details <ArrowForwardIcon fontSize="inherit" />
            </span>
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
