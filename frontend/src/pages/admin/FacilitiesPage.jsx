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
  MenuItem,
  Paper,
  TextField,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import {
  bulkGenerateFacilities,
  deleteBuilding,
  getFacilitiesSummary,
  listBuildings,
  listFloors,
  renameBuilding,
} from '../../services/facilitiesService'
import './FacilitiesPage.css'

const MAX_FLOORS = 20
const MAX_ROOMS_PER_FLOOR = 100
const PAGE_SIZE_STEP = 10

const EMPTY_CREATE_FORM = { building: '', floorCount: '', roomsPerFloor: '' }
const EMPTY_UPDATE_FORM = { newBuilding: '', additionalFloors: '', roomsPerNewFloor: '', floor: '', additionalRooms: '' }
const NO_BUILDINGS = { buildings: [] }
const NO_FLOORS = { floors: [] }

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE_STEP)

  const { data, loading, error } = useAsync(
    () => getFacilitiesSummary(token, { page: 1, page_size: visibleCount }),
    [token, visibleCount, refreshKey],
  )
  const buildings = data?.buildings || []
  const total = data?.total ?? buildings.length
  // Backend already orders owned-by-me first, then alphabetically - this
  // just splits the one fetched/paginated array into the two sections
  // rather than re-sorting or re-fetching.
  const myBuildings = buildings.filter((building) => building.owned_by_me)
  const generalBuildings = buildings.filter((building) => !building.owned_by_me)

  const { data: buildingsData } = useAsync(() => listBuildings(token), [token, refreshKey])
  const buildingOptions = buildingsData?.buildings || NO_BUILDINGS.buildings

  // --- Add Facility (bulk create a brand new building, or top up an existing one) ---
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

  // --- Update a building: rename, add more floors, and/or add rooms to an existing floor ---
  const [updateTarget, setUpdateTarget] = useState(null)
  const [updateForm, setUpdateForm] = useState(EMPTY_UPDATE_FORM)
  const [updateError, setUpdateError] = useState('')
  const [updating, setUpdating] = useState(false)

  const { data: updateFloorsData } = useAsync(
    () => (updateTarget ? listFloors(token, updateTarget.building) : Promise.resolve(NO_FLOORS)),
    [token, updateTarget],
  )
  const updateFloorOptions = useMemo(
    () => (updateFloorsData?.floors || []).filter((floor) => /^\d+$/.test(floor)),
    [updateFloorsData],
  )

  function openUpdateDialog(building) {
    setUpdateTarget(building)
    setUpdateForm({ ...EMPTY_UPDATE_FORM, newBuilding: building.building })
    setUpdateError('')
  }

  async function handleUpdateSubmit(event) {
    event.preventDefault()
    setUpdateError('')

    const currentBuilding = updateTarget.building
    const newBuilding = updateForm.newBuilding.trim()
    if (!newBuilding) {
      setUpdateError('Building name cannot be blank')
      return
    }
    const isRename = newBuilding !== currentBuilding

    const additionalFloors = parseCount(updateForm.additionalFloors, MAX_FLOORS)
    if (additionalFloors === null) {
      setUpdateError(`Additional floors must be a whole number from 0 to ${MAX_FLOORS}`)
      return
    }
    const roomsPerNewFloor = parseCount(updateForm.roomsPerNewFloor, MAX_ROOMS_PER_FLOOR)
    if (roomsPerNewFloor === null) {
      setUpdateError(`Rooms per new floor must be a whole number from 0 to ${MAX_ROOMS_PER_FLOOR}`)
      return
    }
    if (roomsPerNewFloor > 0 && additionalFloors === 0) {
      setUpdateError('Rooms per new floor requires at least one additional floor')
      return
    }

    const additionalRooms = parseCount(updateForm.additionalRooms, MAX_ROOMS_PER_FLOOR)
    if (additionalRooms === null) {
      setUpdateError(`Additional rooms must be a whole number from 0 to ${MAX_ROOMS_PER_FLOOR}`)
      return
    }
    if (additionalRooms > 0 && !updateForm.floor) {
      setUpdateError('Select a floor to add rooms to')
      return
    }

    if (!isRename && additionalFloors === 0 && additionalRooms === 0) {
      setUpdateError('Change the name, or enter a number of floors/rooms to add')
      return
    }

    setUpdating(true)
    try {
      // Rename first, since the floor/room top-up calls below must target
      // whatever the building is named by the time they run.
      const effectiveBuilding = isRename ? (await renameBuilding(token, currentBuilding, newBuilding)).building : currentBuilding

      if (additionalFloors > 0) {
        await bulkGenerateFacilities(token, {
          building: effectiveBuilding,
          floor_count: additionalFloors,
          rooms_per_floor: roomsPerNewFloor,
        })
      }
      if (additionalRooms > 0) {
        await bulkGenerateFacilities(token, {
          building: effectiveBuilding,
          floor: updateForm.floor,
          room_count: additionalRooms,
        })
      }

      setUpdateTarget(null)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setUpdateError(err.message || 'Failed to update building')
    } finally {
      setUpdating(false)
    }
  }

  // --- Delete a whole building ---
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleteError('')
    setDeleting(true)
    try {
      await deleteBuilding(token, deleteTarget.building)
      setDeleteTarget(null)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete building')
    } finally {
      setDeleting(false)
    }
  }

  function renderBuildingCard(building) {
    return (
      <Paper key={building.building} variant="outlined" className="building-card">
        <p className="building-card__name">{building.building}</p>
        <div className="building-card__stats">
          <div className="building-card__stat">
            <p className="building-card__stat-value">{building.floor_count}</p>
            <p className="building-card__stat-label">{building.floor_count === 1 ? 'Floor' : 'Floors'}</p>
          </div>
          <div className="building-card__stat">
            <p className="building-card__stat-value">{building.room_count}</p>
            <p className="building-card__stat-label">{building.room_count === 1 ? 'Room' : 'Rooms'}</p>
          </div>
        </div>
        {building.owned_by_me ? (
          <div className="building-card__actions">
            <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => openUpdateDialog(building)}>
              Update
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteIcon fontSize="small" />}
              onClick={() => setDeleteTarget(building)}
            >
              Delete
            </Button>
          </div>
        ) : (
          <p className="building-card__owner-note">Managed by another admin</p>
        )}
      </Paper>
    )
  }

  return (
    <div>
      <div className="facilities-page__header">
        <p className="facilities-page__title">Facilities</p>
        <Button variant="contained" onClick={openCreateDialog}>
          Add Facility
        </Button>
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
      ) : buildings.length === 0 ? (
        <Paper variant="outlined" className="facilities-page__empty">
          No facilities yet.
        </Paper>
      ) : (
        <>
          {myBuildings.length > 0 && (
            <>
              <p className="facilities-page__section-title">My Facilities</p>
              <div className="facilities-page__grid">{myBuildings.map(renderBuildingCard)}</div>
            </>
          )}

          {generalBuildings.length > 0 && (
            <>
              <p className="facilities-page__section-title">General Facilities</p>
              <div className="facilities-page__grid">{generalBuildings.map(renderBuildingCard)}</div>
            </>
          )}

          <div className="facilities-page__footer">
            <p className="facilities-page__count">
              Showing {buildings.length} of {total} buildings
            </p>
            {buildings.length < total && (
              <Button
                size="small"
                endIcon={<KeyboardArrowDownIcon />}
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE_STEP)}
              >
                Show {Math.min(PAGE_SIZE_STEP, total - buildings.length)} more
              </Button>
            )}
          </div>
        </>
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

      <Dialog open={Boolean(updateTarget)} onClose={() => setUpdateTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Update {updateTarget?.building}</DialogTitle>
        <form onSubmit={handleUpdateSubmit}>
          <DialogContent className="facilities-page__dialog-content">
            {updateError && <Alert severity="error">{updateError}</Alert>}
            <TextField
              label="Building Name"
              fullWidth
              required
              margin="normal"
              value={updateForm.newBuilding}
              onChange={(e) => setUpdateForm((prev) => ({ ...prev, newBuilding: e.target.value }))}
              helperText="Renaming updates every floor/room under this building."
            />

            <p className="facilities-page__topup-section-title">Add more floors</p>
            <TextField
              label="Additional Floors"
              type="number"
              fullWidth
              margin="normal"
              value={updateForm.additionalFloors}
              onChange={(e) => setUpdateForm((prev) => ({ ...prev, additionalFloors: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, max: MAX_FLOORS, step: 1 } }}
              helperText={`Optional. Max ${MAX_FLOORS} floors total per building.`}
            />
            <TextField
              label="Rooms per New Floor"
              type="number"
              fullWidth
              margin="normal"
              value={updateForm.roomsPerNewFloor}
              onChange={(e) => setUpdateForm((prev) => ({ ...prev, roomsPerNewFloor: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, max: MAX_ROOMS_PER_FLOOR, step: 1 } }}
              helperText="Optional. Only applies to the new floors above."
            />

            <p className="facilities-page__topup-section-title">Add rooms to an existing floor</p>
            <TextField
              select
              label="Floor"
              fullWidth
              margin="normal"
              value={updateForm.floor}
              onChange={(e) => setUpdateForm((prev) => ({ ...prev, floor: e.target.value }))}
              helperText={updateFloorOptions.length === 0 ? 'No numbered floors on this building yet' : ' '}
            >
              {updateFloorOptions.map((floorValue) => (
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
              value={updateForm.additionalRooms}
              onChange={(e) => setUpdateForm((prev) => ({ ...prev, additionalRooms: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, max: MAX_ROOMS_PER_FLOOR, step: 1 } }}
              helperText={`Optional. Max ${MAX_ROOMS_PER_FLOOR} rooms total per floor.`}
              disabled={!updateForm.floor}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setUpdateTarget(null)} disabled={updating}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={updating}>
              {updating ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Building</DialogTitle>
        <DialogContent>
          {deleteError && <Alert severity="error">{deleteError}</Alert>}
          <p>
            Delete <strong>{deleteTarget?.building}</strong> and all {deleteTarget?.floor_count} floor(s) /{' '}
            {deleteTarget?.room_count} room(s)? This cannot be undone.
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
