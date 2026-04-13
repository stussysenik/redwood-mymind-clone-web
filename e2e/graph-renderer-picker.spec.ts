/**
 * Graph Renderer Picker — E2E tests
 *
 * Covers:
 *   1. Settings page renders the three-segment renderer control
 *   2. Selecting WebGL/3D updates the active segment (optimistic)
 *   3. Preference persists across navigation (DB-synced)
 *   4. Graph page mounts a canvas element for every backend
 *   5. No JS console errors on any backend
 */

import { expect, login, test } from './support/fixtures'

const BACKENDS = ['Canvas', 'WebGL', '3D'] as const
type Backend = (typeof BACKENDS)[number]

// Helper: navigate to settings and return the renderer control
async function openRendererPicker(page: Parameters<typeof login>[0]) {
  await page.goto('/settings')
  await page.waitForLoadState('networkidle')

  // The section heading
  const heading = page.getByText('Graph renderer', { exact: true })
  await expect(heading).toBeVisible({ timeout: 8000 })

  return {
    canvas: page.getByRole('radio', { name: /Canvas/i }),
    webgl:  page.getByRole('radio', { name: /WebGL/i }),
    three:  page.getByRole('radio', { name: /3D/i }),
  }
}

// Helper: pick a backend and assert it becomes checked
async function selectBackend(
  page: Parameters<typeof login>[0],
  backend: Backend,
  controls: Awaited<ReturnType<typeof openRendererPicker>>
) {
  const btn = backend === 'Canvas' ? controls.canvas
            : backend === 'WebGL'  ? controls.webgl
            : controls.three

  await btn.click()

  // Optimistic update: aria-checked flips immediately
  await expect(btn).toHaveAttribute('aria-checked', 'true', { timeout: 3000 })
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Graph Renderer Picker — Settings UI', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  test('renders three segments: Canvas (stable), WebGL (beta), 3D (beta)', async ({ page }) => {
    const controls = await openRendererPicker(page)

    await expect(controls.canvas).toBeVisible()
    await expect(controls.webgl).toBeVisible()
    await expect(controls.three).toBeVisible()

    // "stable" sublabel on Canvas, "beta" on the other two
    await expect(page.getByText('stable')).toBeVisible()
    const betaLabels = page.getByText('beta')
    await expect(betaLabels).toHaveCount(2)
  })

  test('Canvas is active by default (no prior preference)', async ({ page }) => {
    const controls = await openRendererPicker(page)
    await expect(controls.canvas).toHaveAttribute('aria-checked', 'true')
    await expect(controls.webgl).toHaveAttribute('aria-checked', 'false')
    await expect(controls.three).toHaveAttribute('aria-checked', 'false')
  })

  test('clicking WebGL makes it active immediately (optimistic update)', async ({ page }) => {
    const controls = await openRendererPicker(page)
    await selectBackend(page, 'WebGL', controls)

    await expect(controls.webgl).toHaveAttribute('aria-checked', 'true')
    await expect(controls.canvas).toHaveAttribute('aria-checked', 'false')
  })

  test('clicking 3D makes it active immediately', async ({ page }) => {
    const controls = await openRendererPicker(page)
    await selectBackend(page, '3D', controls)

    await expect(controls.three).toHaveAttribute('aria-checked', 'true')
    await expect(controls.canvas).toHaveAttribute('aria-checked', 'false')
  })

  test('preference persists after navigation and return to settings', async ({ page }) => {
    // Set to WebGL
    let controls = await openRendererPicker(page)
    await selectBackend(page, 'WebGL', controls)

    // Wait for the mutation to settle
    await page.waitForTimeout(800)

    // Navigate away and back
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Return to settings — preference should be WebGL
    controls = await openRendererPicker(page)
    await expect(controls.webgl).toHaveAttribute('aria-checked', 'true', { timeout: 5000 })

    // Restore to Canvas
    await selectBackend(page, 'Canvas', controls)
    await page.waitForTimeout(400)
  })
})

test.describe('Graph Renderer Picker — Graph page integration', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  // Parametrised: each backend should mount a canvas without console errors
  for (const backend of BACKENDS) {
    test(`graph page renders a canvas on "${backend}" backend`, async ({ page }) => {
      // Set backend in settings
      const controls = await openRendererPicker(page)
      await selectBackend(page, backend, controls)
      await page.waitForTimeout(600)  // let mutation commit

      // Collect console errors before navigating to graph
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (err) => errors.push(err.message))

      await page.goto('/graph')
      await page.waitForLoadState('networkidle')
      // Give renderers time to initialize (Pixi/Three async init)
      await page.waitForTimeout(4000)

      // A <canvas> element must exist regardless of backend
      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible({ timeout: 10000 })

      const box = await canvas.boundingBox()
      expect(box).toBeTruthy()
      expect(box!.width).toBeGreaterThan(0)
      expect(box!.height).toBeGreaterThan(0)

      // No JS errors from our code (filter out known third-party noise)
      const ourErrors = errors.filter(
        (e) =>
          !e.includes('ResizeObserver') &&
          !e.includes('Non-Error promise rejection') &&
          !e.includes('favicon')
      )
      expect(ourErrors, `Console errors on ${backend} backend: ${ourErrors.join('\n')}`).toHaveLength(0)

      // Restore to Canvas
      const c2 = await openRendererPicker(page)
      await selectBackend(page, 'Canvas', c2)
    })
  }

  test('rotation handle is visible on 3D backend', async ({ page }) => {
    const controls = await openRendererPicker(page)
    await selectBackend(page, '3D', controls)
    await page.waitForTimeout(600)

    await page.goto('/graph')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(4000)

    const handle = page.getByRole('button', { name: /tilt|3D|flat/i })
    await expect(handle).toBeVisible({ timeout: 8000 })

    // Restore
    const c2 = await openRendererPicker(page)
    await selectBackend(page, 'Canvas', c2)
  })
})
