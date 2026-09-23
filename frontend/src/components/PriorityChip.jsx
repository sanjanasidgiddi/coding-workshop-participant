import PropTypes from 'prop-types'
import { Chip } from '@mui/material'
import { priorityColors } from '../theme/theme'
import { formatEnumLabel } from '../utils/format'

export default function PriorityChip({ priority }) {
  return <Chip size="small" label={formatEnumLabel(priority)} color={priorityColors[priority] || 'default'} />
}

PriorityChip.propTypes = {
  priority: PropTypes.string.isRequired,
}
