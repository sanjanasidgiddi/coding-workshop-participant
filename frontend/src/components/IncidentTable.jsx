import { useState } from 'react'
import PropTypes from 'prop-types'
import { useMediaQuery } from 'react-responsive'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
} from '@mui/material'
import { useAuth } from '../context/AuthContext'
import { listIncidents } from '../services/incidentsService'
import { useFacilities } from '../hooks/useFacilities'
import { useAsync } from '../hooks/useAsync'
import StatusChip from './StatusChip'
import PriorityChip from './PriorityChip'
import { formatDateTime, formatEnumLabel, formatFacility } from '../utils/format'
import './IncidentTable.css'

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED']
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

// A stable default: unlike React's old defaultProps (evaluated once), a JS
// default parameter expression re-runs on every call, so `baseFilters = {}`
// would hand useAsync a brand-new object reference on every render and
// re-fetch forever. This constant is evaluated once at module load instead.
const EMPTY_FILTERS = {}

/**
 * Reusable incident list: a table on desktop, cards on mobile. Filtering
 * and sorting are sent to the backend as query params rather than applied
 * client-side. `baseFilters` are fixed by the caller (e.g. status=OPEN for
 * "My Open Tickets") and hide the corresponding filter control.
 */
export default function IncidentTable({ title, baseFilters = EMPTY_FILTERS, emptyMessage = 'No incidents found.' }) {
  const { token } = useAuth()
  const navigate = useNavigate()
  const { facilityById } = useFacilities()
  const isMobile = useMediaQuery({ maxWidth: 599 })

  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [category, setCategory] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [order, setOrder] = useState('desc')
  // MUI's TablePagination is 0-indexed; the backend's `page` param is 1-indexed.
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const baseKeys = Object.keys(baseFilters)
  const statusLocked = baseKeys.includes('status') || baseKeys.includes('status_ne')

  function resetToFirstPage(setter) {
    return (...args) => {
      setPage(0)
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
      page: page + 1,
      page_size: pageSize,
    }
    return listIncidents(token, query)
  }, [token, baseFilters, status, priority, category, sortBy, order, page, pageSize])

  const incidents = data?.incidents || []
  const total = data?.total ?? incidents.length

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
              onChange={(e) => resetToFirstPage(setStatus)(e.target.value)}
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
              onChange={(e) => resetToFirstPage(setPriority)(e.target.value)}
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
            onChange={(e) => resetToFirstPage(setCategory)(e.target.value)}
            className="incident-table__filter"
          />
        )}

        <FormControl size="small" className="incident-table__filter">
          <InputLabel id="filter-sort-label">Sort by</InputLabel>
          <Select
            labelId="filter-sort-label"
            label="Sort by"
            value={sortBy}
            onChange={(e) => resetToFirstPage(setSortBy)(e.target.value)}
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
            onChange={(e) => resetToFirstPage(setOrder)(e.target.value)}
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
      ) : isMobile ? (
        <div className="incident-table__cards">
          {incidents.map((incident) => (
            <Card key={incident.id} variant="outlined">
              <CardActionArea onClick={() => navigate(`/incidents/${incident.id}`)}>
                <CardContent>
                  <div className="incident-table__card-header">
                    <p className="incident-table__card-title">
                      #{incident.id} {incident.title}
                    </p>
                    <StatusChip status={incident.status} />
                  </div>
                  <p className="incident-table__card-meta">
                    {incident.category || 'Uncategorized'} · {formatFacility(facilityById[incident.facility_id])}
                  </p>
                  <div className="incident-table__card-footer">
                    <PriorityChip priority={incident.priority} />
                    <p className="incident-table__card-updated">Updated {formatDateTime(incident.updated_at)}</p>
                  </div>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </div>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Facility</TableCell>
                <TableCell>Assigned Engineer</TableCell>
                <TableCell>Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {incidents.map((incident) => (
                <TableRow
                  key={incident.id}
                  hover
                  onClick={() => navigate(`/incidents/${incident.id}`)}
                  className="incident-table__row"
                >
                  <TableCell>{incident.id}</TableCell>
                  <TableCell>{incident.title}</TableCell>
                  <TableCell>{incident.category || '—'}</TableCell>
                  <TableCell>
                    <StatusChip status={incident.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityChip priority={incident.priority} />
                  </TableCell>
                  <TableCell>{formatFacility(facilityById[incident.facility_id])}</TableCell>
                  <TableCell>
                    {incident.assigned_engineer_id ? `Engineer #${incident.assigned_engineer_id}` : 'Unassigned'}
                  </TableCell>
                  <TableCell>{formatDateTime(incident.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {!loading && incidents.length > 0 && (
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_event, newPage) => setPage(newPage)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          onRowsPerPageChange={(e) => {
            setPageSize(Number(e.target.value))
            setPage(0)
          }}
        />
      )}
    </div>
  )
}

IncidentTable.propTypes = {
  title: PropTypes.string.isRequired,
  baseFilters: PropTypes.object,
  emptyMessage: PropTypes.string,
}
