import PropTypes from 'prop-types'
import { Paper } from '@mui/material'
import './StatCard.css'

/** A single dashboard stat tile. `colorKey` is one of the semantic palette
 * keys used by statusColors/priorityColors ('default' | 'info' | 'warning' |
 * 'success' | 'error'), keeping stat-card accents consistent with the chips
 * used everywhere else instead of the mauve brand color. */
export default function StatCard({ label, value, colorKey = 'default' }) {
  return (
    <Paper variant="outlined" className={`stat-card stat-card--${colorKey}`}>
      <p className="stat-card__value">{value}</p>
      <p className="stat-card__label">{label}</p>
    </Paper>
  )
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  colorKey: PropTypes.oneOf(['default', 'info', 'warning', 'success', 'error']),
}
