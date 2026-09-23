import PropTypes from 'prop-types'
import { PieChart } from '@mui/x-charts/PieChart'
import { BarChart } from '@mui/x-charts/BarChart'
import { Paper } from '@mui/material'
import { theme } from '../../theme/theme'
import './DistributionChart.css'

const NEUTRAL_BAR_COLOR = theme.palette.primary.main

/**
 * A single labeled distribution chart, used for status/priority breakdowns
 * (pie, semantic colors) and open-ended breakdowns like category/building
 * (bar, a single neutral brand color since those aren't semantic states).
 */
export default function DistributionChart({ title, data, variant = 'pie' }) {
  if (data.length === 0) {
    return (
      <Paper variant="outlined" className="distribution-chart distribution-chart--empty">
        <p className="distribution-chart__title">{title}</p>
        <p className="distribution-chart__empty-text">No data yet.</p>
      </Paper>
    )
  }

  return (
    <Paper variant="outlined" className="distribution-chart">
      <p className="distribution-chart__title">{title}</p>
      {variant === 'pie' ? (
        <PieChart
          series={[
            {
              data: data.map((d, i) => ({ id: i, label: d.label, value: d.value, color: d.color })),
              innerRadius: 30,
              paddingAngle: 2,
              cornerRadius: 3,
              highlightScope: { fade: 'global', highlight: 'item' },
            },
          ]}
          height={220}
          slotProps={{ legend: { direction: 'vertical', position: { vertical: 'middle', horizontal: 'right' } } }}
        />
      ) : (
        <BarChart
          xAxis={[{ scaleType: 'band', data: data.map((d) => d.label) }]}
          series={[{ data: data.map((d) => d.value), color: NEUTRAL_BAR_COLOR }]}
          height={220}
        />
      )}
    </Paper>
  )
}

DistributionChart.propTypes = {
  title: PropTypes.string.isRequired,
  data: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired,
      color: PropTypes.string,
    }),
  ).isRequired,
  variant: PropTypes.oneOf(['pie', 'bar']),
}
