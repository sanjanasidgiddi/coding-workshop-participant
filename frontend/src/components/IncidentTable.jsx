import { useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { useAuth } from '../context/AuthContext'
import { listIncidents } from '../services/incidentsService'
import { useFacilities } from '../hooks/useFacilities'
import { useAsync } from '../hooks/useAsync'
import IncidentCard from './IncidentCard'
import { formatEnumLabel } from '../utils/format'
import './IncidentTable.css'

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED']
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const PAGE_SIZE_STEP = 10

// A stable default: unlike React's old defaultProps (evaluated once), a JS
// default parameter expression re-runs on every call, so `baseFilters = {}`
// would hand useAsync a brand-new object reference on every render and
// re-fetch forever. This constant is evaluated once at module load instead.
const EMPTY_FILTERS = {}

/**
 * Reusable incident list: a responsive grid of IncidentCards at every
 * breakpoint. Filtering and sorting are sent to the backend as query params
 * rather than applied client-side. `baseFilters` are fixed by the caller
 * (e.g. status=OPEN for "My Open Tickets") and hide the corresponding
 * filter control.
 */
export default function IncidentTable({
  title,
  baseFilters = EMPTY_FILTERS,
  emptyMessage = 'No incidents found.',
  splitByOwnership = false,
}) {
  const { token } = useAuth()
  const { facilityById } = useFacilities()

  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [category, setCategory] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [order, setOrder] = useState('desc')
  // Simple "show N, then expand by 10" list instead of page-by-page
  // navigation: always fetch the first `visibleCount` rows, growing it on
  // each "Show 10 more" click.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE_STEP)

  const baseKeys = Object.keys(baseFilters)
  const statusLocked = baseKeys.includes('status') || baseKeys.includes('status_ne')

  function resetVisibleCount(setter) {
    return (...args) => {
      setVisibleCount(PAGE_SIZE_STEP)
      setter(...args)
    }
  }

  const { data, loading, error } = useAsync(() => {
    const query = {
      ...baseFilters,
      ...(statusLocked ? {} : { status: status || undefined }),
      ...(baseKeys.includes('priority') ? {} : { priority: priority || undefined }),
      ...(baseKeys.includes('category') ? {} : { category: category || undefined }),
      sort_by: sortBy,
      order,
      page: 1,
      page_size: visibleCount,
    }
    return listIncidents(token, query)
  }, [token, baseFilters, status, priority, category, sortBy, order, visibleCount])

  const incidents = data?.incidents || []
  const total = data?.total ?? incidents.length
  const hasMore = incidents.length < total

  // Backend already orders owned-by-me first (for FACILITY_ADMIN callers) -
  // this just splits the one fetched/paginated array into two sections
  // rather than re-sorting or re-fetching. No-op (empty arrays) for
  // employee/engineer, whose incidents never carry `owned_by_me`.
  const myIncidents = splitByOwnership ? incidents.filter((incident) => incident.owned_by_me) : []
  const generalIncidents = splitByOwnership ? incidents.filter((incident) => !incident.owned_by_me) : incidents

  return (
    <div>
      <p className="incident-table__title">{title}</p>

      <div className="incident-table__filters">
        {!statusLocked && (
          <FormControl size="small" className="incident-table__filter">
            <InputLabel id="filter-status-label">Status</InputLabel>
            <Select
              labelId="filter-status-label"
              label="Status"
              value={status}
              onChange={(e) => resetVisibleCount(setStatus)(e.target.value)}
            >
              <MenuItem value="">All statuses</MenuItem>
              {STATUS_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {formatEnumLabel(option)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {!baseKeys.includes('priority') && (
          <FormControl size="small" className="incident-table__filter">
            <InputLabel id="filter-priority-label">Priority</InputLabel>
            <Select
              labelId="filter-priority-label"
              label="Priority"
              value={priority}
              onChange={(e) => resetVisibleCount(setPriority)(e.target.value)}
            >
              <MenuItem value="">All priorities</MenuItem>
              {PRIORITY_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {formatEnumLabel(option)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {!baseKeys.includes('category') && (
          <TextField
            size="small"
            label="Category"
            value={category}
            onChange={(e) => resetVisibleCount(setCategory)(e.target.value)}
            className="incident-table__filter"
          />
        )}

        <FormControl size="small" className="incident-table__filter">
          <InputLabel id="filter-sort-label">Sort by</InputLabel>
          <Select
            labelId="filter-sort-label"
            label="Sort by"
            value={sortBy}
            onChange={(e) => resetVisibleCount(setSortBy)(e.target.value)}
          >
            <MenuItem value="created_at">Created date</MenuItem>
            <MenuItem value="updated_at">Updated date</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" className="incident-table__filter">
          <InputLabel id="filter-order-label">Order</InputLabel>
          <Select
            labelId="filter-order-label"
            label="Order"
            value={order}
            onChange={(e) => resetVisibleCount(setOrder)(e.target.value)}
          >
            <MenuItem value="desc">Newest first</MenuItem>
            <MenuItem value="asc">Oldest first</MenuItem>
          </Select>
        </FormControl>
      </div>

      {error && (
        <Alert severity="error" className="incident-table__error">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="incident-table__loading">
          <CircularProgress />
        </div>
      ) : incidents.length === 0 ? (
        <Paper variant="outlined" className="incident-table__empty">
          {emptyMessage}
        </Paper>
      ) : (
        <>
          {splitByOwnership && myIncidents.length > 0 && (
            <>
              <p className="incident-table__section-title">My Facility Incidents</p>
              <div className="incident-table__grid">
                {myIncidents.map((incident) => (
                  <IncidentCard key={incident.id} incident={incident} facility={facilityById[incident.facility_id]} />
                ))}
              </div>
            </>
          )}

          {splitByOwnership && generalIncidents.length > 0 && (
            <p className="incident-table__section-title">General Incidents</p>
          )}
          <div className="incident-table__grid">
            {generalIncidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} facility={facilityById[incident.facility_id]} />
            ))}
          </div>
        </>
      )}

      {!loading && incidents.length > 0 && (
        <div className="incident-table__footer">
          <p className="incident-table__count">
            Showing {incidents.length} of {total}
          </p>
          {hasMore && (
            <Button
              size="small"
              endIcon={<KeyboardArrowDownIcon />}
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE_STEP)}
            >
              Show {Math.min(PAGE_SIZE_STEP, total - incidents.length)} more
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

IncidentTable.propTypes = {
  title: PropTypes.string.isRequired,
  baseFilters: PropTypes.object,
  emptyMessage: PropTypes.string,
  splitByOwnership: PropTypes.bool,
}
