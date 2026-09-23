import PropTypes from 'prop-types'
import { Alert, CircularProgress } from '@mui/material'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { getIncidentStats } from '../../services/incidentsService'
import { priorityColors, semanticColorHex, statusColors } from '../../theme/theme'
import { formatEnumLabel } from '../../utils/format'
import StatCard from './StatCard'
import DistributionChart from './DistributionChart'
import './DashboardStats.css'

/**
 * Role-aware incident dashboard: stat cards + distribution charts, all
 * driven by one role-scoped GET /incidents/stats call (the backend already
 * restricts the underlying counts to what each role may see, so this
 * component only decides which cards/charts to show, not how to filter).
 */
export default function DashboardStats({ totalLabel, variant = 'employee' }) {
  const { token } = useAuth()
  const { data: stats, loading, error } = useAsync(() => getIncidentStats(token), [token])

  if (loading) {
    return (
      <div>
        <p className="dashboard-stats__title">Dashboard</p>
        <div className="dashboard-stats__loading">
          <CircularProgress />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <p className="dashboard-stats__title">Dashboard</p>
        <Alert severity="error" className="dashboard-stats__error">
          {error}
        </Alert>
      </div>
    )
  }

  const byStatus = stats?.by_status || {}
  const byPriority = stats?.by_priority || {}
  const byCategory = stats?.by_category || []
  const byFacility = stats?.by_facility || []

  const cards = [
    { label: totalLabel, value: stats?.total ?? 0, colorKey: 'default' },
    { label: 'Open', value: byStatus.OPEN ?? 0, colorKey: statusColors.OPEN },
    { label: 'In Progress', value: byStatus.IN_PROGRESS ?? 0, colorKey: statusColors.IN_PROGRESS },
    { label: 'Blocked', value: byStatus.BLOCKED ?? 0, colorKey: statusColors.BLOCKED },
  ]
  if (variant === 'admin') {
    cards.push({ label: 'Critical', value: byPriority.CRITICAL ?? 0, colorKey: priorityColors.CRITICAL })
  }
  cards.push({ label: 'Resolved', value: byStatus.RESOLVED ?? 0, colorKey: statusColors.RESOLVED })

  const statusData = Object.entries(byStatus)
    .filter(([, value]) => value > 0)
    .map(([status, value]) => ({
      label: formatEnumLabel(status),
      value,
      color: semanticColorHex[statusColors[status]] || semanticColorHex.default,
    }))

  const priorityData = Object.entries(byPriority)
    .filter(([, value]) => value > 0)
    .map(([priority, value]) => ({
      label: formatEnumLabel(priority),
      value,
      color: semanticColorHex[priorityColors[priority]] || semanticColorHex.default,
    }))

  // Admins get one more distribution: whichever of category/building has
  // more to show, so the extra chart isn't just empty for this demo data.
  const extraChart =
    variant === 'admin' && (byCategory.length > 0 || byFacility.length > 0)
      ? byCategory.length >= byFacility.length
        ? { title: 'By Category', data: byCategory.map((c) => ({ label: c.category, value: c.count })) }
        : { title: 'By Building', data: byFacility.map((f) => ({ label: f.building, value: f.count })) }
      : null

  return (
    <div className="dashboard-stats">
      <p className="dashboard-stats__title">Dashboard</p>
      <div className="dashboard-stats__cards">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} colorKey={card.colorKey} />
        ))}
      </div>

      <div className="dashboard-stats__charts">
        <DistributionChart title="By Status" data={statusData} variant="pie" />
        <DistributionChart title="By Priority" data={priorityData} variant="pie" />
        {extraChart && <DistributionChart title={extraChart.title} data={extraChart.data} variant="bar" />}
      </div>
    </div>
  )
}

DashboardStats.propTypes = {
  totalLabel: PropTypes.string.isRequired,
  variant: PropTypes.oneOf(['admin', 'engineer', 'employee']),
}
