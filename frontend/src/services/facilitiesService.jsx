import { apiRequest } from './apiClient'

// Floor is optional on a facility. A query string can't carry a real
// `null`, so this sentinel stands in for "facilities in this building with
// no floor set" - must match NO_FLOOR_SENTINEL in backend/facilities/function.py.
export const NO_FLOOR_SENTINEL = '__NONE__'

export function listFacilities(token) {
  return apiRequest('facilities', '', { token })
}

export function listBuildings(token) {
  return apiRequest('facilities', '/buildings', { token })
}

export function listFloors(token, building) {
  return apiRequest('facilities', '/floors', { token, query: { building } })
}

export function listRooms(token, building, floor) {
  return apiRequest('facilities', '/rooms', { token, query: { building, floor } })
}

export function createFacility(token, payload) {
  return apiRequest('facilities', '', { method: 'POST', body: payload, token })
}

/**
 * Bulk-generates floor/room rows for a building. `payload` is either
 * `{ building, floor_count, rooms_per_floor }` (create/add floors) or
 * `{ building, floor, room_count }` (add rooms to one existing floor).
 */
export function bulkGenerateFacilities(token, payload) {
  return apiRequest('facilities', '/bulk', { method: 'POST', body: payload, token })
}

export function updateFacility(token, id, payload) {
  return apiRequest('facilities', `/${id}`, { method: 'PUT', body: payload, token })
}

export function deleteFacility(token, id) {
  return apiRequest('facilities', `/${id}`, { method: 'DELETE', token })
}
