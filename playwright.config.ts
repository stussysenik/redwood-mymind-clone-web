import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:8913',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Mobile-first: test mobile viewports FIRST
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
    // Then desktop
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Desktop Safari',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // RedwoodJS dev server
  webServer: {
    command: 'yarn rw dev',
    url: 'http://localhost:8913',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
