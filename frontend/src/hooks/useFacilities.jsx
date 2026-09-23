import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { listFacilities } from '../services/facilitiesService'
import { useAsync } from './useAsync'

/** Loads the facility directory once, for selectors and for resolving facility_id -> facility on incident rows. */
export function useFacilities() {
  const { token } = useAuth()
  const { data, loading, error } = useAsync(() => listFacilities(token), [token])

  const facilities = useMemo(() => data?.facilities || [], [data])
  const facilityById = useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f])), [facilities])

  return { facilities, facilityById, loading, error }
}
