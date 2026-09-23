import { apiRequest } from './apiClient'

export function listFacilities(token) {
  return apiRequest('facilities', '', { token })
}
