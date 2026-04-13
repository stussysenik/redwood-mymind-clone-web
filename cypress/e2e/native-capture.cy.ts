describe('Native Capture — Settings UI smoke', () => {
  beforeEach(() => {
    const email = Cypress.env('TEST_USER_EMAIL')
    const password = Cypress.env('TEST_USER_PASSWORD')
    if (!email || !password) {
      throw new Error(
        'Set CYPRESS_TEST_USER_EMAIL and CYPRESS_TEST_USER_PASSWORD in env before running'
      )
    }
    cy.loginViaUi(email as string, password as string)
  })

  it('generates then revokes a token via the Settings UI', () => {
    cy.visit('/settings')
    cy.contains('h2', /mobile capture/i).should('be.visible')

    // Open the dialog
    cy.contains('button', /generate token/i).click()

    // Use a unique device name so the revoke target is unambiguous
    const deviceName = `Cypress ${Date.now()}`
    cy.get('#device-name-input').clear().type(deviceName)

    // Submit
    cy.contains('button', /^create$/i).click()

    // Plaintext token should appear
    cy.contains(/byoa_[a-f0-9]{8}_[a-f0-9]{32}/).should('be.visible')

    // Close the dialog
    cy.contains('button', /^done$/i).click()

    // Active token row with our device name
    cy.contains(deviceName).should('be.visible')

    // Accept the confirm() dialog that Revoke triggers
    cy.on('window:confirm', () => true)

    // Click the Revoke button for our specific token
    cy.get(`button[aria-label="Revoke ${deviceName}"]`).click()

    // Token row should disappear
    cy.contains(deviceName).should('not.exist')
  })
})
