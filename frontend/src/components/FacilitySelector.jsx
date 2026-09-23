import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, FormControl, FormHelperText, InputLabel, MenuItem, Select } from '@mui/material'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { NO_FLOOR_SENTINEL, listBuildings, listFloors, listRooms } from '../services/facilitiesService'
import './FacilitySelector.css'

const EMPTY_ARRAY = []
const NO_FLOORS = { floors: EMPTY_ARRAY }
const NO_ROOMS = { rooms: EMPTY_ARRAY }

/**
 * Building -> Floor -> Room cascading facility picker. Resolves to a
 * facility_id (the value passed to onChange) - never a building/floor/room
 * string. Each level's *bare* row (no floor, or no room) is a real,
 * selectable facility in its own right - a whole-building or whole-floor
 * incident - resolved automatically as the default at that level rather
 * than shown as a fake "room" option:
 *
 *   Building only            -> the (building, NULL, NULL) row
 *   Building + Floor only    -> the (building, floor, NULL) row
 *   Building + Floor + Room  -> the specific room row
 */
export default function FacilitySelector({ value = '', onChange, disabled = false }) {
  const { token } = useAuth()
  const [building, setBuilding] = useState('')
  const [floor, setFloor] = useState('')
  // Once the user explicitly clears an auto-selected floor/room, stop
  // re-auto-selecting it right back - otherwise "clear" would be a no-op
  // whenever there's still only one option. Cleared on any change upstream
  // (new building, new floor) since that's a fresh choice to auto-resolve.
  const [floorCleared, setFloorCleared] = useState(false)
  const [roomCleared, setRoomCleared] = useState(false)

  const { data: buildingsData, loading: buildingsLoading, error: buildingsError } = useAsync(
    () => listBuildings(token),
    [token],
  )
  const buildings = buildingsData?.buildings || []

  const { data: floorsData, loading: floorsLoading, error: floorsError } = useAsync(
    () => (building ? listFloors(token, building) : Promise.resolve(NO_FLOORS)),
    [token, building],
  )
  const floors = useMemo(() => floorsData?.floors || EMPTY_ARRAY, [floorsData])

  // Rooms are fetched for the "effective" floor - a blank floor (nothing
  // chosen yet) is queried the same way as explicitly picking "Whole
  // building", since both mean "facilities with no floor set". This is what
  // lets the building-level default resolve without the user ever touching
  // the Floor field.
  const effectiveFloor = floor || NO_FLOOR_SENTINEL
  const { data: roomsData, loading: roomsLoading, error: roomsError } = useAsync(
    () => (building ? listRooms(token, building, effectiveFloor) : Promise.resolve(NO_ROOMS)),
    [token, building, effectiveFloor],
  )
  const allRows = useMemo(() => roomsData?.rooms || EMPTY_ARRAY, [roomsData])
  // The bare row at the current level (no room set) represents "this whole
  // building" or "this whole floor" - a real, selectable facility, not a
  // room. Actual rooms are everything else.
  const bareRow = useMemo(() => allRows.find((row) => row.room === null), [allRows])
  const rooms = useMemo(() => allRows.filter((row) => row.room !== null), [allRows])

  const loadError = buildingsError || floorsError || roomsError

  // Floor is optional, so when a building has only one possible floor, pick
  // it automatically instead of making the user click through a one-item
  // dropdown before the "optional" field will let them submit.
  useEffect(() => {
    if (!floorsLoading && !floorCleared && floors.length === 1 && floor !== floors[0]) {
      // Auto-selecting a one-item dropdown, not reacting to a value React
      // itself owns - the resulting re-render is the intended outcome.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFloor(floors[0])
    }
  }, [floorsLoading, floors, floor, floorCleared])

  // Default resolution: the bare row at the current level (whole building,
  // or whole floor) whenever one exists, so picking just a building (or a
  // building + floor) is already enough to submit. Falls back to
  // auto-selecting a single real room for older data that has no bare
  // floor-level row at all.
  useEffect(() => {
    if (roomsLoading || roomCleared || value) return
    if (bareRow) {
      onChange(bareRow.id)
    } else if (rooms.length === 1) {
      onChange(rooms[0].id)
    }
    // onChange intentionally excluded: callers pass a new function each
    // render, and this effect should only re-run when the fetched rows (or
    // the current value) change, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsLoading, bareRow, rooms, value, roomCleared])

  function handleBuildingChange(event) {
    setBuilding(event.target.value)
    setFloor('')
    setFloorCleared(false)
    setRoomCleared(false)
    onChange('')
  }

  function handleFloorChange(event) {
    const newFloor = event.target.value
    setFloor(newFloor)
    setFloorCleared(newFloor === '')
    setRoomCleared(false)
    onChange('')
  }

  function handleRoomChange(event) {
    const newValue = event.target.value
    onChange(newValue)
    setRoomCleared(newValue === '')
  }

  return (
    <div className="facility-selector">
      {loadError && (
        <Alert severity="warning" className="facility-selector__alert">
          Could not load facilities: {loadError}
        </Alert>
      )}

      <div className="facility-selector__row">
        <FormControl fullWidth required disabled={disabled || buildingsLoading}>
          <InputLabel id="facility-building-label">Building</InputLabel>
          <Select labelId="facility-building-label" label="Building" value={building} onChange={handleBuildingChange}>
            {buildings.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
          {buildingsLoading && <FormHelperText>Loading buildings…</FormHelperText>}
          {!buildingsLoading && buildings.length === 0 && <FormHelperText>No buildings available</FormHelperText>}
        </FormControl>

        <FormControl fullWidth disabled={disabled || !building || floorsLoading}>
          <InputLabel id="facility-floor-label">Floor (optional)</InputLabel>
          <Select labelId="facility-floor-label" label="Floor (optional)" value={floor} onChange={handleFloorChange}>
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {floors.map((value_) => (
              <MenuItem key={value_} value={value_}>
                {value_ === NO_FLOOR_SENTINEL ? 'Whole building' : value_}
              </MenuItem>
            ))}
          </Select>
          {building && floorsLoading && <FormHelperText>Loading floors…</FormHelperText>}
          {building && !floorsLoading && floors.length === 0 && <FormHelperText>No floors available</FormHelperText>}
        </FormControl>

        <FormControl fullWidth disabled={disabled || !floor || roomsLoading}>
          <InputLabel id="facility-room-label">Room (optional)</InputLabel>
          <Select labelId="facility-room-label" label="Room (optional)" value={value || ''} onChange={handleRoomChange}>
            {bareRow ? (
              <MenuItem value={bareRow.id}>Entire floor</MenuItem>
            ) : (
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
            )}
            {rooms.map((room) => (
              <MenuItem key={room.id} value={room.id}>
                {room.room}
              </MenuItem>
            ))}
          </Select>
          {floor && roomsLoading && <FormHelperText>Loading rooms…</FormHelperText>}
          {floor && !roomsLoading && rooms.length === 0 && !bareRow && <FormHelperText>No rooms available</FormHelperText>}
        </FormControl>
      </div>
    </div>
  )
}

FacilitySelector.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}
