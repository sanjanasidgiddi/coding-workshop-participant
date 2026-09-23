import { apiRequest } from './apiClient'

export function listFacilities(token) {
  return apiRequest('facilities', '', { token })
}

export function createFacility(token, payload) {
  return apiRequest('facilities', '', { method: 'POST', body: payload, token })
}

export function updateFacility(token, id, payload) {
  return apiRequest('facilities', `/${id}`, { method: 'PUT', body: payload, token })
}

export function deleteFacility(token, id) {
  return apiRequest('facilities', `/${id}`, { method: 'DELETE', token })
}
