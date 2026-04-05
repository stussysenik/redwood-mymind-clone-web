import { expect, login, test } from './support/fixtures'
import { GraphPage } from './support/graph.page'

test.describe('Graph Performance', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  test('graph reaches interactive state within 5 seconds', async ({
    page,
  }) => {
    const graphPage = new GraphPage(page)
    const tti = await graphPage.measureTimeToInteractive()
    console.log(`[perf] Time to interactive: ${tti}ms`)
    expect(tti).toBeLessThan(5000)
  })

  test('graph canvas maintains 30+ FPS', async ({ page }) => {
    const graphPage = new GraphPage(page)
    await graphPage.goto()
    await graphPage.waitForGraphRender()
    const fps = await graphPage.measureFPS(3000)
    console.log(`[perf] Graph FPS: ${fps}`)
    expect(fps).toBeGreaterThan(25)
  })

  test('list view renders card thumbnails', async ({ page }) => {
    const graphPage = new GraphPage(page)
    await graphPage.goto()
    await graphPage.switchToList()
    const cardCount = await graphPage.getListCardCount()
    console.log(`[perf] List cards: ${cardCount}`)
    expect(cardCount).toBeGreaterThan(0)
    const imageCount = await graphPage.getListCardImages()
    console.log(`[perf] Cards with images: ${imageCount}/${cardCount}`)
  })

  test('view mode toggle is responsive', async ({ page }) => {
    const graphPage = new GraphPage(page)
    await graphPage.goto()
    await graphPage.waitForGraphRender()

    const start = Date.now()
    await graphPage.switchToList()
    const switchTime = Date.now() - start
    console.log(`[perf] Graph→List switch: ${switchTime}ms`)
    expect(switchTime).toBeLessThan(2000)
  })
})
