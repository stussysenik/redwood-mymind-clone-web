import type { Page, Locator } from '@playwright/test'

export class GraphPage {
  readonly page: Page
  readonly canvas: Locator
  readonly listView: Locator
  readonly graphToggle: Locator
  readonly listToggle: Locator
  readonly filterPanel: Locator

  constructor(page: Page) {
    this.page = page
    this.canvas = page.locator('canvas')
    this.listView = page.locator('.space-y-4')
    this.graphToggle = page.locator('button[role="tab"]', { hasText: 'Graph' })
    this.listToggle = page.locator('button[role="tab"]', { hasText: 'List' })
    this.filterPanel = page.locator('[data-testid="graph-filter-panel"]')
  }

  async goto() {
    await this.page.goto('/graph')
    await this.page.waitForLoadState('networkidle')
  }

  async waitForGraphRender(timeout = 10000) {
    await this.canvas.waitFor({ state: 'visible', timeout })
    await this.page.waitForTimeout(3000)
  }

  async waitForListRender(timeout = 10000) {
    await this.listView.waitFor({ state: 'visible', timeout })
  }

  async switchToList() {
    await this.listToggle.click()
    await this.waitForListRender()
  }

  async switchToGraph() {
    await this.graphToggle.click()
    await this.waitForGraphRender()
  }

  async getNodeCount(): Promise<number> {
    return this.page.evaluate(() => {
      const text = document.querySelector('[class*="text-xs"]')?.textContent || ''
      const match = text.match(/(\d+)\s*nodes/)
      return match ? parseInt(match[1], 10) : 0
    })
  }

  async measureFPS(durationMs = 3000): Promise<number> {
    return this.page.evaluate((duration) => {
      return new Promise<number>((resolve) => {
        let frames = 0
        const start = performance.now()
        function countFrame() {
          frames++
          if (performance.now() - start < duration) {
            requestAnimationFrame(countFrame)
          } else {
            const elapsed = performance.now() - start
            resolve(Math.round((frames / elapsed) * 1000))
          }
        }
        requestAnimationFrame(countFrame)
      })
    }, durationMs)
  }

  async measureTimeToInteractive(): Promise<number> {
    const start = Date.now()
    await this.goto()
    await this.waitForGraphRender()
    return Date.now() - start
  }

  async getListCardCount(): Promise<number> {
    return this.page.locator('section').count()
  }

  async getListCardImages(): Promise<number> {
    return this.page.locator('section img').count()
  }
}
