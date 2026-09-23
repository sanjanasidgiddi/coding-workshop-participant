const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

let onUnauthorized = null

/** Registers a callback invoked whenever any request gets a 401 response. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

/**
 * Calls a backend Lambda service through the `/api/{service}` convention
 * used by both the local dev proxy and CloudFront, attaching the bearer
 * token when one is provided.
 */
export async function apiRequest(service, path, { method = 'GET', body, token, query } = {}) {
  const queryString = query
    ? '?' +
      new URLSearchParams(
        Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
      ).toString()
    : ''

  const response = await fetch(`${BASE_URL}/api/${service}${path}${queryString}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    if (response.status === 401 && onUnauthorized) {
      onUnauthorized()
    }
    throw new ApiError(response.status, data?.error || 'Request failed')
  }

  return data
}
