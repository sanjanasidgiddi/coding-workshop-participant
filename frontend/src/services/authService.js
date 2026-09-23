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
