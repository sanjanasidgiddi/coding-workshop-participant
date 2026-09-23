import { apiRequest } from './apiClient'

export function listIncidents(token, query = {}) {
  return apiRequest('incidents', '', { token, query })
}

export function getIncidentStats(token) {
  return apiRequest('incidents', '/stats', { token })
}

export function createIncident(token, payload) {
  return apiRequest('incidents', '', { method: 'POST', body: payload, token })
}

export function getIncident(token, id) {
  return apiRequest('incidents', `/${id}`, { token })
}

export function updateIncident(token, id, payload) {
  return apiRequest('incidents', `/${id}`, { method: 'PATCH', body: payload, token })
}
