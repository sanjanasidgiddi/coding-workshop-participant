/**
 * The one critical-path E2E flow this suite covers end to end:
 *
 *   Employee logs in, creates an incident
 *   -> Admin sees it and assigns an engineer
 *   -> Engineer sees the assigned ticket and updates its status
 *
 * All accounts/building are throwaway, uniquely named per run (registered
 * via the real API in `before`), and never touch existing demo data.
 * Cleanup of this run's rows is documented in docs/testing.md (there is no
 * DELETE endpoint for users/incidents, so it's a follow-up SQL snippet
 * rather than something Cypress itself can do through the API).
 */

const runId = Date.now()
const password = 'CypressTest123!'
const employee = { name: `Cypress Employee ${runId}`, email: `cypress.${runId}.employee@acme.inc`, password, role: 'EMPLOYEE' }
const admin = { name: `Cypress Admin ${runId}`, email: `cypress.${runId}.admin@acme.inc`, password, role: 'FACILITY_ADMIN' }
const engineer = { name: `Cypress Engineer ${runId}`, email: `cypress.${runId}.engineer@acme.inc`, password, role: 'ENGINEER' }
const building = `CypressBuilding${runId}`
const incidentTitle = `Cypress incident ${runId}`

function loginAs(user) {
  cy.visit('/login')
  cy.get('input[type="email"]').type(user.email)
  cy.get('input[type="password"]').type(user.password)
  cy.contains('button', 'Sign In').click()
}

function logout() {
  cy.contains('button', 'Logout').click()
  cy.location('pathname').should('eq', '/login')
}

function openSelect(labelText) {
  // Some selects (e.g. Assigned Engineer) start disabled until their own
  // async options load - wait for that before clicking, or the click lands
  // on a disabled control and no menu ever opens.
  cy.contains('.MuiFormControl-root', labelText)
    .find('[role="combobox"]')
    .should('not.have.attr', 'aria-disabled', 'true')
    .click()
}

function pickOption(optionText) {
  cy.get('ul[role="listbox"]').contains('li', optionText).click()
}

describe('Critical path: employee creates incident -> admin assigns engineer -> engineer updates status', () => {
  before(() => {
    ;[employee, admin, engineer].forEach((user) => {
      cy.request('POST', 'http://localhost:3001/api/users/register', user)
    })
    cy.request('POST', 'http://localhost:3001/api/users/login', { email: admin.email, password: admin.password }).then((res) => {
      cy.request({
        method: 'POST',
        url: 'http://localhost:3001/api/facilities/bulk',
        headers: { Authorization: `Bearer ${res.body.access_token}` },
        body: { building, floor_count: 1, rooms_per_floor: 1 },
      })
    })
  })

  it('runs the full workflow', () => {
    // --- Employee: create an incident ---
    loginAs(employee)
    cy.location('pathname').should('eq', '/employee/dashboard')
    cy.contains('a, button, [role="tab"]', 'Create Incident').click()

    cy.contains('label', 'Title').invoke('attr', 'for').then((id) => cy.get(`#${id}`).type(incidentTitle))
    openSelect('Building')
    pickOption(building)
    // A 1-floor/1-room building auto-cascades to a fully resolved facility,
    // so Floor/Room never need to be touched - the Submit button enables on
    // its own once that resolution finishes.
    cy.contains('button', 'Submit Incident').should('not.be.disabled').click()

    cy.contains('Incident created successfully.').should('be.visible')
    cy.contains(incidentTitle).should('be.visible')
    logout()

    // --- Admin: find it and assign the engineer ---
    loginAs(admin)
    cy.location('pathname').should('eq', '/admin/dashboard')
    cy.contains('a, button, [role="tab"]', 'All Incidents').click()
    cy.contains(incidentTitle).click()

    openSelect('Assigned Engineer')
    pickOption(engineer.name)
    cy.contains('button', 'Assign Engineer').click()
    cy.contains(`Engineer #`).should('be.visible') // sidebar "Assigned engineer" fact updates
    logout()

    // --- Engineer: see the assigned ticket and update its status ---
    loginAs(engineer)
    cy.location('pathname').should('eq', '/engineer/dashboard')
    cy.contains('a, button, [role="tab"]', 'My Assigned Tickets').click()
    cy.contains(incidentTitle).click()

    openSelect('Status')
    pickOption('In Progress')
    cy.contains('button', 'Update Status').click()
    cy.contains('In Progress').should('be.visible')
  })
})
