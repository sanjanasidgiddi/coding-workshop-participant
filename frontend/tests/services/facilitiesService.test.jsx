import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteBuilding, getFacilitiesSummary, renameBuilding } from '../../src/services/facilitiesService'

function mockFetchOnce({ ok, status = 200, body }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('facilitiesService (mocked fetch)', () => {
  it('GET /facilities/summary sends query params and the bearer auth header', async () => {
    mockFetchOnce({ ok: true, body: { buildings: [], total: 0 } })

    await getFacilitiesSummary('tok123', { page: 2, page_size: 10 })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('http://localhost:3001/api/facilities/summary?page=2&page_size=10')
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toBe('Bearer tok123')
  })

  it('PUT /facilities/building sends the rename body as JSON', async () => {
    mockFetchOnce({ ok: true, body: { building: 'New Name', updated_count: 3 } })

    const result = await renameBuilding('tok', 'Old Name', 'New Name')

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('http://localhost:3001/api/facilities/building')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ building: 'Old Name', new_building: 'New Name' })
    expect(result.updated_count).toBe(3)
  })

  it('throws an error carrying the server message when the response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 403, body: { error: "You do not own building 'X'" } })

    await expect(deleteBuilding('tok', 'X')).rejects.toThrow("You do not own building 'X'")
  })
})
