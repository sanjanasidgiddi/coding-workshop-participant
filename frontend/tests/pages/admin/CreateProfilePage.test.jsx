import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateProfilePage from '../../../src/pages/admin/CreateProfilePage'
import { registerUser } from '../../../src/services/authService'

vi.mock('../../../src/services/authService', () => ({
  registerUser: vi.fn(),
}))

function fillForm(user, { name = 'Ada Lovelace', email = 'ada@acme.inc', password = 'password123' } = {}) {
  return Promise.resolve()
    .then(() => user.type(screen.getByLabelText('Name', { exact: false }), name))
    .then(() => user.type(screen.getByLabelText('Email', { exact: false }), email))
    .then(() => user.type(screen.getByLabelText('Password', { exact: false }), password))
}

describe('CreateProfilePage', () => {
  it('renders all registration fields and the three role options', async () => {
    render(<CreateProfilePage />)

    expect(screen.getByLabelText('Name', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText('Email', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText('Password', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText('Role')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Role'))
    expect(screen.getByRole('option', { name: 'Employee' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Facility Admin' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Engineer' })).toBeInTheDocument()
  })

  it('submits to registerUser, shows a success message, and resets the form without navigating or logging in', async () => {
    registerUser.mockResolvedValueOnce({ id: 42 })
    const user = userEvent.setup()
    render(<CreateProfilePage />)

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Create Profile' }))

    expect(registerUser).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@acme.inc',
      password: 'password123',
      role: 'EMPLOYEE',
    })
    expect(await screen.findByText('Profile created successfully.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name', { exact: false })).toHaveValue('')
    expect(screen.getByLabelText('Email', { exact: false })).toHaveValue('')
    expect(screen.getByLabelText('Password', { exact: false })).toHaveValue('')
  })

  it('shows the backend error message on failure (e.g. duplicate email) and keeps the form filled in', async () => {
    registerUser.mockRejectedValueOnce(new Error('Email already registered'))
    const user = userEvent.setup()
    render(<CreateProfilePage />)

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Create Profile' }))

    expect(await screen.findByText('Email already registered')).toBeInTheDocument()
    expect(screen.getByLabelText('Name', { exact: false })).toHaveValue('Ada Lovelace')
    expect(screen.queryByText('Profile created successfully.')).not.toBeInTheDocument()
  })
})
