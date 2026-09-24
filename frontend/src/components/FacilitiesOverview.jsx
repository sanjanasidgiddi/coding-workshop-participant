import { useState } from 'react'
import { Alert, Button, CircularProgress, Paper } from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { getFacilitiesSummary } from '../services/facilitiesService'
import './FacilitiesOverview.css'

const PAGE_SIZE_STEP = 10

/**
 * Read-only building/floor/room overview, shared by the employee and
 * engineer "Facilities" tabs - same building-card summary as the
 * FACILITY_ADMIN Facilities page, minus the Update/Delete/Add controls.
 */
export default function FacilitiesOverview() {
  const { token } = useAuth()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE_STEP)

  const { data, loading, error } = useAsync(
    () => getFacilitiesSummary(token, { page: 1, page_size: visibleCount }),
    [token, visibleCount],
  )
  const buildings = data?.buildings || []
  const total = data?.total ?? buildings.length

  return (
    <div>
      <p className="facilities-overview__title">Facilities</p>

      {error && (
        <Alert severity="error" className="facilities-overview__alert">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="facilities-overview__loading">
          <CircularProgress />
        </div>
      ) : buildings.length === 0 ? (
        <Paper variant="outlined" className="facilities-overview__empty">
          No facilities yet.
        </Paper>
      ) : (
        <>
          <div className="facilities-overview__grid">
            {buildings.map((building) => (
              <Paper key={building.building} variant="outlined" className="facilities-overview__card">
                <p className="facilities-overview__card-name">{building.building}</p>
                <div className="facilities-overview__card-stats">
                  <div>
                    <p className="facilities-overview__card-stat-value">{building.floor_count}</p>
                    <p className="facilities-overview__card-stat-label">
                      {building.floor_count === 1 ? 'Floor' : 'Floors'}
                    </p>
                  </div>
                  <div>
                    <p className="facilities-overview__card-stat-value">{building.room_count}</p>
                    <p className="facilities-overview__card-stat-label">
                      {building.room_count === 1 ? 'Room' : 'Rooms'}
                    </p>
                  </div>
                </div>
              </Paper>
            ))}
          </div>

          <div className="facilities-overview__footer">
            <p className="facilities-overview__count">
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
    </div>
  )
}
