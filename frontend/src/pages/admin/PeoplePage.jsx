import {
  Alert,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { listEngineers } from '../../services/authService'
import { formatDateTime, formatEnumLabel } from '../../utils/format'
import './PeoplePage.css'

// Module-level constant: a stable reference so useAsync doesn't see a new
// array (and refetch) on every render. All 3 roles, not a filtered subset -
// this is the same "get all users" endpoint the incident-assignment
// dropdown uses (which defaults to ENGINEER-only), just asked for every role.
const PEOPLE_ROLES = ['EMPLOYEE', 'ENGINEER', 'FACILITY_ADMIN']

export default function PeoplePage() {
  const { token } = useAuth()
  const { data, loading, error } = useAsync(() => listEngineers(token, PEOPLE_ROLES), [token])
  const people = data?.engineers || []

  return (
    <div>
      <p className="people-page__title">People</p>

      {error && (
        <Alert severity="error" className="people-page__alert">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="people-page__loading">
          <CircularProgress />
        </div>
      ) : people.length === 0 ? (
        <Paper variant="outlined" className="people-page__empty">
          No engineers or employees yet.
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map((person) => (
                <TableRow key={person.id}>
                  <TableCell>{person.id}</TableCell>
                  <TableCell>{person.name}</TableCell>
                  <TableCell>{person.email}</TableCell>
                  <TableCell>{formatEnumLabel(person.role)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={person.active ? 'Active' : 'Inactive'}
                      color={person.active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{formatDateTime(person.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  )
}
