import { useMemo, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import {
  bulkGenerateFacilities,
  deleteFacility,
  listFacilities,
  updateFacility,
} from '../../services/facilitiesService'
import { formatDateTime, formatFacility } from '../../utils/format'
import './FacilitiesPage.css'

const MAX_FLOORS = 20
const MAX_ROOMS_PER_FLOOR = 100

const EMPTY_EDIT_FORM = { building: '', floor: '', room: '' }
const EMPTY_CREATE_FORM = { building: '', floorCount: '', roomsPerFloor: '' }
const EMPTY_TOPUP_FORM = { building: '', additionalFloors: '', roomsPerNewFloor: '', floor: '', additionalRooms: '' }
const EMPTY_FACILITIES = []

function distinctSorted(values) {
  return [...new Set(values.filter(Boolean))].sort()
}

/** Parses a "whole number, 0..max, or blank" form field. Returns null if invalid. */
function parseCount(value, max) {
  if (value === '' || value === null || value === undefined) return 0
  if (!/^\d+$/.test(String(value))) return null
  const parsed = Number(value)
  return parsed >= 0 && parsed <= max ? parsed : null
}

export default function FacilitiesPage() {
  const { token } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)

  const { data, loading, error } = useAsync(() => listFacilities(token), [token, refreshKey])
  const facilities = useMemo(() => data?.facilities || EMPTY_FACILITIES, [data])

  const buildingOptions = useMemo(() => distinctSorted(facilities.map((f) => f.building)), [facilities])

  // --- Add Facility (bulk create / add more floors+rooms) ---
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  function openCreateDialog() {
    setCreateForm(EMPTY_CREATE_FORM)
    setCreateError('')
    setCreateDialogOpen(true)
  }

  async function handleCreateSubmit(event) {
    event.preventDefault()
    setCreateError('')

    const building = createForm.building.trim()
    if (!building) {
      setCreateError('Building name is required')
      return
    }
    const floorCount = parseCount(createForm.floorCount, MAX_FLOORS)
    if (floorCount === null) {
      setCreateError(`Number of floors must be a whole number from 0 to ${MAX_FLOORS}`)
      return
    }
    const roomsPerFloor = parseCount(createForm.roomsPerFloor, MAX_ROOMS_PER_FLOOR)
    if (roomsPerFloor === null) {
      setCreateError(`Rooms per floor must be a whole number from 0 to ${MAX_ROOMS_PER_FLOOR}`)
      return
    }
    if (roomsPerFloor > 0 && floorCount === 0) {
      setCreateError('Rooms per floor requires at least one floor')
      return
    }

    setCreating(true)
    try {
      await bulkGenerateFacilities(token, { building, floor_count: floorCount, rooms_per_floor: roomsPerFloor })
      setCreateDialogOpen(false)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setCreateError(err.message || 'Failed to create facility')
    } finally {
      setCreating(false)
    }
  }

  // --- Add Floors / Rooms (top up an existing building) ---
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false)
  const [topUpForm, setTopUpForm] = useState(EMPTY_TOPUP_FORM)
  const [topUpError, setTopUpError] = useState('')
  const [toppingUp, setToppingUp] = useState(false)

  const topUpFloorOptions = useMemo(
    () =>
      distinctSorted(facilities.filter((f) => f.building === topUpForm.building).map((f) => f.floor)).filter((f) =>
        /^\d+$/.test(f),
      ),
    [facilities, topUpForm.building],
  )

  function openTopUpDialog() {
    setTopUpForm(EMPTY_TOPUP_FORM)
    setTopUpError('')
    setTopUpDialogOpen(true)
  }

  async function handleTopUpSubmit(event) {
    event.preventDefault()
    setTopUpError('')

    const building = topUpForm.building.trim()
    if (!building) {
      setTopUpError('Select a building')
      return
    }

    const additionalFloors = parseCount(topUpForm.additionalFloors, MAX_FLOORS)
    if (additionalFloors === null) {
      setTopUpError(`Additional floors must be a whole number from 0 to ${MAX_FLOORS}`)
      return
    }
    const roomsPerNewFloor = parseCount(topUpForm.roomsPerNewFloor, MAX_ROOMS_PER_FLOOR)
    if (roomsPerNewFloor === null) {
      setTopUpError(`Rooms per new floor must be a whole number from 0 to ${MAX_ROOMS_PER_FLOOR}`)
      return
    }
    if (roomsPerNewFloor > 0 && additionalFloors === 0) {
      setTopUpError('Rooms per new floor requires at least one additional floor')
      return
    }

    const additionalRooms = parseCount(topUpForm.additionalRooms, MAX_ROOMS_PER_FLOOR)
    if (additionalRooms === null) {
      setTopUpError(`Additional rooms must be a whole number from 0 to ${MAX_ROOMS_PER_FLOOR}`)
      return
    }
    if (additionalRooms > 0 && !topUpForm.floor) {
      setTopUpError('Select a floor to add rooms to')
      return
    }

    if (additionalFloors === 0 && additionalRooms === 0) {
      setTopUpError('Enter a number of floors to add, or a number of rooms to add to a floor')
      return
    }

    setToppingUp(true)
    try {
      if (additionalFloors > 0) {
        await bulkGenerateFacilities(token, {
          building,
          floor_count: additionalFloors,
          rooms_per_floor: roomsPerNewFloor,
        })
      }
      if (additionalRooms > 0) {
        await bulkGenerateFacilities(token, { building, floor: topUpForm.floor, room_count: additionalRooms })
      }
      setTopUpDialogOpen(false)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setTopUpError(err.message || 'Failed to add floors/rooms')
    } finally {
      setToppingUp(false)
    }
  }

  // --- Edit / Delete a single existing row (unchanged single-row CRUD) ---
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM)
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  function openEditDialog(facility) {
    setEditingId(facility.id)
    setEditForm({ building: facility.building, floor: facility.floor || '', room: facility.room || '' })
    setEditError('')
    setEditDialogOpen(true)
  }

  function updateEditField(field) {
    return (event) => setEditForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  async function handleEditSubmit(event) {
    event.preventDefault()
    setEditError('')
    setSaving(true)
    try {
      const payload = {
        building: editForm.building,
        floor: editForm.floor || undefined,
        room: editForm.room || undefined,
      }
      await updateFacility(token, editingId, payload)
      setEditDialogOpen(false)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setEditError(err.message || 'Failed to save facility')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleteError('')
    setDeleting(true)
    try {
      await deleteFacility(token, deleteTarget.id)
      setDeleteTarget(null)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete facility')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="facilities-page__header">
        <p className="facilities-page__title">Facilities</p>
        <div className="facilities-page__header-actions">
          <Button variant="outlined" onClick={openTopUpDialog}>
            Add Floors / Rooms
          </Button>
          <Button variant="contained" onClick={openCreateDialog}>
            Add Facility
          </Button>
        </div>
      </div>

      {error && (
        <Alert severity="error" className="facilities-page__alert">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="facilities-page__loading">
          <CircularProgress />
        </div>
      ) : facilities.length === 0 ? (
        <Paper variant="outlined" className="facilities-page__empty">
          No facilities yet.
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Building</TableCell>
                <TableCell>Floor</TableCell>
                <TableCell>Room</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {facilities.map((facility) => (
                <TableRow key={facility.id} hover>
                  <TableCell>{facility.building}</TableCell>
                  <TableCell>{facility.floor || '—'}</TableCell>
                  <TableCell>{facility.room || '—'}</TableCell>
                  <TableCell>{formatDateTime(facility.created_at)}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEditDialog(facility)} aria-label="Edit facility">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleteTarget(facility)} aria-label="Delete facility">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add Facility</DialogTitle>
        <form onSubmit={handleCreateSubmit}>
          <DialogContent className="facilities-page__dialog-content">
            {createError && <Alert severity="error">{createError}</Alert>}
            <Autocomplete
              freeSolo
              options={buildingOptions}
              inputValue={createForm.building}
              onInputChange={(_, value) => setCreateForm((prev) => ({ ...prev, building: value }))}
              renderInput={(params) => <TextField {...params} label="Building Name" required fullWidth margin="normal" />}
            />
            <TextField
              label="Number of Floors"
              type="number"
              fullWidth
              margin="normal"
              value={createForm.floorCount}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, floorCount: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, max: MAX_FLOORS, step: 1 } }}
              helperText={`Optional — leave blank for building-level only. Max ${MAX_FLOORS} floors.`}
            />
            <TextField
              label="Rooms per Floor"
              type="number"
              fullWidth
              margin="normal"
              value={createForm.roomsPerFloor}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, roomsPerFloor: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, max: MAX_ROOMS_PER_FLOOR, step: 1 } }}
              helperText={`Optional — leave blank for floor-level only. Max ${MAX_ROOMS_PER_FLOOR} rooms per floor.`}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={topUpDialogOpen} onClose={() => setTopUpDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add Floors / Rooms</DialogTitle>
        <form onSubmit={handleTopUpSubmit}>
          <DialogContent className="facilities-page__dialog-content">
            {topUpError && <Alert severity="error">{topUpError}</Alert>}
            <Autocomplete
              options={buildingOptions}
              value={topUpForm.building || null}
              onChange={(_, value) => setTopUpForm({ ...EMPTY_TOPUP_FORM, building: value || '' })}
              renderInput={(params) => <TextField {...params} label="Building" required fullWidth margin="normal" />}
            />

            <p className="facilities-page__topup-section-title">Add more floors</p>
            <TextField
              label="Additional Floors"
              type="number"
              fullWidth
              margin="normal"
              value={topUpForm.additionalFloors}
              onChange={(e) => setTopUpForm((prev) => ({ ...prev, additionalFloors: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, max: MAX_FLOORS, step: 1 } }}
              helperText={`Optional. Max ${MAX_FLOORS} floors total per building.`}
              disabled={!topUpForm.building}
            />
            <TextField
              label="Rooms per New Floor"
              type="number"
              fullWidth
              margin="normal"
              value={topUpForm.roomsPerNewFloor}
              onChange={(e) => setTopUpForm((prev) => ({ ...prev, roomsPerNewFloor: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, max: MAX_ROOMS_PER_FLOOR, step: 1 } }}
              helperText="Optional. Only applies to the new floors above."
              disabled={!topUpForm.building}
            />

            <p className="facilities-page__topup-section-title">Add rooms to an existing floor</p>
            <TextField
              select
              label="Floor"
              fullWidth
              margin="normal"
              value={topUpForm.floor}
              onChange={(e) => setTopUpForm((prev) => ({ ...prev, floor: e.target.value }))}
              disabled={!topUpForm.building}
              helperText={topUpForm.building && topUpFloorOptions.length === 0 ? 'No numbered floors on this building yet' : ' '}
            >
              {topUpFloorOptions.map((floorValue) => (
                <MenuItem key={floorValue} value={floorValue}>
                  {floorValue}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Additional Rooms"
              type="number"
              fullWidth
              margin="normal"
              value={topUpForm.additionalRooms}
              onChange={(e) => setTopUpForm((prev) => ({ ...prev, additionalRooms: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, max: MAX_ROOMS_PER_FLOOR, step: 1 } }}
              helperText={`Optional. Max ${MAX_ROOMS_PER_FLOOR} rooms total per floor.`}
              disabled={!topUpForm.floor}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTopUpDialogOpen(false)} disabled={toppingUp}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={toppingUp}>
              {toppingUp ? 'Adding…' : 'Add'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Edit Facility</DialogTitle>
        <form onSubmit={handleEditSubmit}>
          <DialogContent className="facilities-page__dialog-content">
            {editError && <Alert severity="error">{editError}</Alert>}
            <TextField
              label="Building"
              fullWidth
              required
              margin="normal"
              value={editForm.building}
              onChange={updateEditField('building')}
            />
            <TextField
              label="Floor (optional)"
              fullWidth
              margin="normal"
              value={editForm.floor}
              onChange={updateEditField('floor')}
            />
            <TextField
              label="Room (optional)"
              fullWidth
              margin="normal"
              value={editForm.room}
              onChange={updateEditField('room')}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Facility</DialogTitle>
        <DialogContent>
          {deleteError && <Alert severity="error">{deleteError}</Alert>}
          <p>
            Delete <strong>{formatFacility(deleteTarget)}</strong>? This cannot be undone.
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
