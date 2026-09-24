import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../../src/pages/auth/LoginPage'

const login = vi.fn()
const navigate = vi.fn()

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ login }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigate }
})

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('shows an inline error when the email is invalid on blur, and clears it once the user retypes', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    const emailField = screen.getByLabelText('Email', { exact: false })
    await user.type(emailField, 'not-an-email')
    await user.tab()

    expect(await screen.findByText('Email address invalid')).toBeInTheDocument()

    await user.type(emailField, '.still-typing')
    expect(screen.queryByText('Email address invalid')).not.toBeInTheDocument()
  })

  it('calls login() with the entered credentials and navigates home on success', async () => {
    login.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Email', { exact: false }), 'jane.doe@acme.inc')
    await user.type(screen.getByLabelText('Password', { exact: false }), 'correct-horse')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('jane.doe@acme.inc', 'correct-horse'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }))
  })

  it('shows the server error message and does not navigate on failed login', async () => {
    login.mockRejectedValueOnce(new Error('Invalid email or password'))
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Email', { exact: false }), 'jane.doe@acme.inc')
    await user.type(screen.getByLabelText('Password', { exact: false }), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })
})
