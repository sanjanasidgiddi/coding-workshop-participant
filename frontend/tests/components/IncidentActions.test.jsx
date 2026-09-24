import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import IncidentActions from '../../src/components/IncidentActions'

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ token: 'fake-token' }),
}))

vi.mock('../../src/services/authService', () => ({
  listEngineers: vi.fn().mockResolvedValue({ engineers: [{ id: 9, name: 'Bob Hill' }] }),
}))

const baseIncident = { id: 1, priority: 'LOW', status: 'OPEN', assigned_engineer_id: null }

describe('IncidentActions ownership gating (FACILITY_ADMIN)', () => {
  it('renders no mutation controls at all for a non-owned incident, only the ownership note', () => {
    render(
      <IncidentActions incident={{ ...baseIncident, owned_by_me: false }} role="FACILITY_ADMIN" onUpdated={vi.fn()} />,
    )

    expect(screen.getByText('Managed by another admin')).toBeInTheDocument()
    expect(screen.queryByText('Update Priority')).not.toBeInTheDocument()
    expect(screen.queryByText('Assign Engineer')).not.toBeInTheDocument()
    expect(screen.queryByText('Close Incident')).not.toBeInTheDocument()
  })

  it('renders the full admin action panel for an owned incident', async () => {
    render(
      <IncidentActions incident={{ ...baseIncident, owned_by_me: true }} role="FACILITY_ADMIN" onUpdated={vi.fn()} />,
    )

    expect(await screen.findByText('Update Priority')).toBeInTheDocument()
    expect(screen.getByText('Assign Engineer')).toBeInTheDocument()
    expect(screen.getByText('Close Incident')).toBeInTheDocument()
    expect(screen.queryByText('Managed by another admin')).not.toBeInTheDocument()
  })
})

describe('IncidentActions engineer workflow (unaffected by ownership)', () => {
  it('renders the status-update panel for the assigned engineer regardless of owned_by_me', () => {
    render(
      <IncidentActions
        incident={{ ...baseIncident, assigned_engineer_id: 9, owned_by_me: false }}
        role="ENGINEER"
        onUpdated={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Update Status' })).toBeInTheDocument()
    expect(screen.queryByText('Managed by another admin')).not.toBeInTheDocument()
  })

  it('hides the status-update controls for a CLOSED incident and shows a read-only note instead', () => {
    render(
      <IncidentActions
        incident={{ ...baseIncident, status: 'CLOSED', assigned_engineer_id: 9, owned_by_me: false }}
        role="ENGINEER"
        onUpdated={vi.fn()}
      />,
    )

    expect(screen.getByText('This incident is closed and can no longer be updated.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update Status' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
  })
})
