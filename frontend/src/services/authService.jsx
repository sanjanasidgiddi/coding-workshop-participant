import { apiRequest } from './apiClient'

export function registerUser({ name, email, password, role }) {
  return apiRequest('users', '/register', { method: 'POST', body: { name, email, password, role } })
}

export function loginUser({ email, password }) {
  return apiRequest('users', '/login', { method: 'POST', body: { email, password } })
}

export function getCurrentUser(token) {
  return apiRequest('users', '/me', { token })
}

/**
 * Defaults to ENGINEER only (for the assignment dropdown). Pass e.g.
 * `['EMPLOYEE', 'ENGINEER']` to widen it - reused by the People directory
 * instead of a separate endpoint.
 */
export function listEngineers(token, roles) {
  return apiRequest('users', '/engineers', { token, query: { roles: roles?.join(',') } })
}
