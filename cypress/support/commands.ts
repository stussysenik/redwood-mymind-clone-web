/// <reference types="cypress" />

/**
 * Log in via the Redwood UI using seeded credentials from env vars.
 * Requires CYPRESS_TEST_USER_EMAIL and CYPRESS_TEST_USER_PASSWORD to be set.
 */
Cypress.Commands.add('loginViaUi', (email: string, password: string) => {
  cy.visit('/login')
  cy.get('input[type="email"]').type(email)
  cy.get('input[type="password"]').type(password)
  cy.get('button[type="submit"]').click()
  cy.url({ timeout: 10_000 }).should('not.include', '/login')
})

declare global {
  namespace Cypress {
    interface Chainable {
      loginViaUi(email: string, password: string): Chainable<void>
    }
  }
}

export {}
