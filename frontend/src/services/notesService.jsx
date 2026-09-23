import { apiRequest } from './apiClient'

export function listNotes(token, incidentId) {
  return apiRequest('notes', '', { token, query: { incident_id: incidentId } })
}

export function createNote(token, incidentId, note) {
  return apiRequest('notes', '', { method: 'POST', body: { incident_id: incidentId, note }, token })
}
