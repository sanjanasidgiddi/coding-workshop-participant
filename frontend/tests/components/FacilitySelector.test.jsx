import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FacilitySelector from '../../src/components/FacilitySelector'
import * as facilitiesService from '../../src/services/facilitiesService'

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ token: 'fake-token' }),
}))

describe('FacilitySelector cascading selection', () => {
  it('auto-resolves through a single floor to that floor\'s whole-floor facility once a building is picked', async () => {
    vi.spyOn(facilitiesService, 'listBuildings').mockResolvedValue({ buildings: ['Nova Tower'] })
    vi.spyOn(facilitiesService, 'listFloors').mockResolvedValue({ floors: ['1'] })
    vi.spyOn(facilitiesService, 'listRooms').mockImplementation((token, building, floor) =>
      Promise.resolve(floor === '1' ? { rooms: [{ id: 42, room: null }] } : { rooms: [] }),
    )

    const handleChange = vi.fn()
    render(<FacilitySelector value="" onChange={handleChange} />)

    const user = userEvent.setup()
    await user.click(await screen.findByLabelText('Building', { exact: false }))
    await user.click(await screen.findByRole('option', { name: 'Nova Tower' }))

    // Floor has only one option (1), so it's auto-selected without the user
    // touching the Floor field, and that floor's bare ("whole floor") row
    // is then auto-resolved as the chosen facility.
    await waitFor(() => expect(handleChange).toHaveBeenCalledWith(42))
  })

  it('lets the user pick a specific room when a floor has more than one', async () => {
    vi.spyOn(facilitiesService, 'listBuildings').mockResolvedValue({ buildings: ['Atlas Hall'] })
    vi.spyOn(facilitiesService, 'listFloors').mockResolvedValue({ floors: ['1'] })
    vi.spyOn(facilitiesService, 'listRooms').mockImplementation((token, building, floor) =>
      Promise.resolve(
        floor === '1'
          ? { rooms: [{ id: 101, room: '101' }, { id: 102, room: '102' }] }
          : { rooms: [] },
      ),
    )

    const handleChange = vi.fn()
    const { rerender } = render(<FacilitySelector value="" onChange={handleChange} />)

    const user = userEvent.setup()
    await user.click(await screen.findByLabelText('Building', { exact: false }))
    await user.click(await screen.findByRole('option', { name: 'Atlas Hall' }))
    handleChange.mockClear() // selecting a building itself clears the parent's value via onChange('')

    // Two real rooms and no bare row - nothing should auto-resolve; the
    // Room field only becomes enabled once the floor's rooms have loaded.
    const roomField = screen.getByLabelText('Room (optional)', { exact: false })
    await waitFor(() => expect(roomField).not.toHaveAttribute('aria-disabled', 'true'))
    expect(handleChange).not.toHaveBeenCalled()

    await user.click(roomField)
    await user.click(await screen.findByRole('option', { name: '102' }))
    expect(handleChange).toHaveBeenCalledWith(102)

    // Reflect the parent's controlled `value` update, as the real app would.
    rerender(<FacilitySelector value={102} onChange={handleChange} />)
    expect(await screen.findByText('102')).toBeInTheDocument()
  })
})
