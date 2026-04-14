## Capability: auth-form-accessibility

Owns the accessibility contract for every user-facing auth form — sign in, sign up, password reset, and any future MFA step. Scope: form-field labeling, browser autofill affordances, focus order, error announcements. Implementation of these invariants MUST be verified by a Playwright spec that runs on all four viewport projects so the contract is checked on both mobile and desktop.

## ADDED Requirements

### Requirement: Every auth-form input has a programmatic label

Every `<input>` on `/login` and `/signup` MUST have an `id` attribute, and a corresponding `<label for="{id}">` element MUST exist in the DOM. The label text MUST describe the input purpose in human language ("Email", "Password", "Confirm password"), not a field name or placeholder. A visually-hidden label (`sr-only` or equivalent) is acceptable when the visual design has no room for a visible label.

The `id` values MUST be unique per page so multiple forms on the same route do not collide.

Inputs without a corresponding label MUST be treated as a build-blocking a11y failure.

#### Scenario: Login email input has a matching label

Given a user on `/login`,
When the browser parses the DOM,
Then `document.querySelector('input[type=email]').id` returns a non-empty string, and `document.querySelector('label[for={id}]')` returns an element whose text content contains "Email" (case-insensitive).

#### Scenario: Login password input has a matching label

Given a user on `/login`,
When the browser parses the DOM,
Then `document.querySelector('input[type=password]').id` returns a non-empty string, and a matching `label[for]` element exists whose text content contains "Password".

#### Scenario: Signup forms meet the same contract

Given a user on `/signup`,
When the browser parses the DOM,
Then every visible `<input>` element has an `id` attribute and a matching `<label for>` element, including any confirm-password field.

### Requirement: Every auth-form input declares its autofill role

Every `<input>` on `/login` and `/signup` MUST have an `autoComplete` attribute that matches the [HTML autofill tokens](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill):

- Email inputs MUST use `autoComplete="email"`.
- Login password inputs MUST use `autoComplete="current-password"`.
- Signup password inputs MUST use `autoComplete="new-password"`.
- Confirm-password inputs (if present) MUST use `autoComplete="new-password"`.

This requirement enables password managers and browser autofill to populate the fields correctly, which is both an accessibility and security invariant (it reduces phishing surface by letting password managers key on site origin).

#### Scenario: Browser console is silent about autocomplete

Given a user navigates to `/login`,
When the page finishes loading,
Then the browser console contains zero messages matching `/Input elements should have autocomplete attributes/`.

#### Scenario: Password managers can autofill the login form

Given a user has a saved credential for the current origin in their password manager,
When they navigate to `/login`,
Then the email and password inputs are candidates for autofill (the browser recognizes the inputs via `autoComplete="email"` and `autoComplete="current-password"`).

#### Scenario: Signup password uses new-password

Given a user on `/signup`,
When the browser parses the password input,
Then its `autoComplete` attribute is exactly `"new-password"` (not `"current-password"` or `"password"`).

### Requirement: Auth form a11y is enforced by an E2E test

A Playwright spec named `e2e/login-form-a11y.spec.ts` MUST enforce both the label and autofill requirements. The spec MUST run on all four viewport projects configured in `playwright.config.ts` (`Mobile Safari`, `Mobile Chrome`, `Desktop Chrome`, `Desktop Safari`) so the contract is verified at every screen size. A failure of this spec MUST block the ship.

#### Scenario: Spec exists and runs on every viewport

Given the repository at HEAD after this change lands,
When `grep 'login-form-a11y' e2e/login-form-a11y.spec.ts` runs,
Then the file exists and its contents declare at least one `test(...)` per form field × project combination.

#### Scenario: Spec runs against prod URL when told to

Given the environment has `PLAYWRIGHT_BASE_URL=https://mymind-clone-production.up.railway.app`,
When `yarn playwright test login-form-a11y` runs,
Then the spec fetches the live `/login` page and verifies the same label and autocomplete invariants without relying on a local dev server.
