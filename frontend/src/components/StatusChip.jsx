import PropTypes from 'prop-types'
import { Chip } from '@mui/material'
import { statusColors } from '../theme/theme'
import { formatEnumLabel } from '../utils/format'

export default function StatusChip({ status }) {
  return <Chip size="small" label={formatEnumLabel(status)} color={statusColors[status] || 'default'} />
}

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
}
