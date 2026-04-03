import {
  buildHighFidelityHtmlTextSnapshot,
  buildSourceTextSnapshotFromPayloads,
  buildSourceTextSnapshotFromSegments,
  detectSourceBlockerSignals,
  isWeakSourceTextSnapshot,
  type SourceBlockerSignal,
} from './sourceText'

type RenderPlatform =
  | 'twitter'
  | 'instagram'
  | 'reddit'
  | 'linkedin'
  | 'tiktok'
  | 'perplexity'
  | 'generic'

interface PopupDismissalConfig {
  selectors: string[]
  waitAfter?: number
}

type SourceEvidenceKind = 'rendered-html' | 'rendered-network'

const POPUP_CONFIGS: Partial<Record<RenderPlatform, PopupDismissalConfig>> = {
  twitter: {
    selectors: [
      '[data-testid="sheetDialog"] [aria-label="Close"]',
      '[data-testid="signup-bar-close-button"]',
      '[role="dialog"] button[aria-label="Close"]',
      '[role="alertdialog"] button[aria-label="Close"]',
      'button[data-testid="confirmationSheetCancel"]',
    ],
    waitAfter: 500,
  },
  instagram: {
    selectors: [
      'button[aria-label="Close"]',
      'button:has-text("Not now")',
      'button:has-text("Not Now")',
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
    ],
    waitAfter: 500,
  },
  reddit: {
    selectors: [
      'button[aria-label="Close"]',
      'button:has-text("Accept all")',
      'button:has-text("Continue")',
    ],
    waitAfter: 300,
  },
  linkedin: {
    selectors: [
      'button[aria-label="Dismiss"]',
      'button:has-text("Sign in")',
      'button:has-text("Accept")',
    ],
    waitAfter: 500,
  },
  tiktok: {
    selectors: [
      'button:has-text("Accept all")',
      '[data-e2e="modal-close-inner-button"]',
    ],
    waitAfter: 500,
  },
  perplexity: {
    selectors: [
      'button[aria-label="Close"]',
      'button:has-text("Maybe later")',
      'button:has-text("Continue")',
      'button:has-text("Skip")',
    ],
    waitAfter: 500,
  },
}

export interface RenderedPageContentResult {
  success: boolean
  platform: RenderPlatform
  html?: string
  title?: string
  networkTextSnapshot?: string
  networkResponseCount?: number
  networkTextBytes?: number
  blockerSignals?: SourceBlockerSignal[]
  evidenceKinds?: SourceEvidenceKind[]
  error?: string
}

let chromium: any = null
let playwright: any = null
const MAX_CAPTURED_NETWORK_RESPONSES = 16
const MAX_CAPTURED_RESPONSE_BYTES = 200_000
const NETWORK_CAPTURE_TIMEOUT_MS = 1000

function detectPlatform(url: string): RenderPlatform {
  const lower = url.toLowerCase()
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter'
  if (lower.includes('instagram.com')) return 'instagram'
  if (lower.includes('reddit.com')) return 'reddit'
  if (lower.includes('linkedin.com')) return 'linkedin'
  if (lower.includes('tiktok.com')) return 'tiktok'
  if (lower.includes('perplexity.ai')) return 'perplexity'
  return 'generic'
}

function isServerless(): boolean {
  return !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
}

async function loadPlaywrightDependencies() {
  if (!playwright) {
    if (isServerless()) {
      chromium = await import('@sparticuz/' + 'chromium')
      playwright = await import('playwright-core')
    } else {
      playwright = await import('playwright')
    }
  }

  return { playwright, chromium }
}

async function dismissPopups(page: any, platform: RenderPlatform): Promise<void> {
  const config = POPUP_CONFIGS[platform]
  if (!config) {
    return
  }

  for (const selector of config.selectors) {
    try {
      const element = page.locator(selector).first()
      const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false)
      if (isVisible) {
        await element.click({ timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(300)
      }
    } catch {
      // Ignore selector misses.
    }
  }

  if (config.waitAfter) {
    await page.waitForTimeout(config.waitAfter)
  }
}

async function waitForMeaningfulContent(page: any): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const bodyText = (document.body?.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
        return (
          bodyText.length >= 120 ||
          !!document.querySelector('main, article, [role="main"], img, video')
        )
      },
      { timeout: 10000 }
    )
  } catch {
    // Fall through and use whatever rendered.
  }
}

function shouldCaptureNetworkResponse(response: any): boolean {
  const request = response.request?.()
  const resourceType = request?.resourceType?.()
  if (resourceType !== 'fetch' && resourceType !== 'xhr') {
    return false
  }

  const status = response.status?.() ?? 0
  if (status < 200 || status >= 400) {
    return false
  }

  const headers = response.headers?.() || {}
  const contentType = String(headers['content-type'] || '').toLowerCase()

  return (
    contentType.includes('application/json') ||
    contentType.includes('application/ld+json') ||
    contentType.includes('text/plain') ||
    contentType.includes('text/html') ||
    contentType.includes('application/xml') ||
    contentType.includes('text/xml')
  )
}

async function captureNetworkPayload(
  response: any,
  payloads: unknown[]
): Promise<void> {
  if (!shouldCaptureNetworkResponse(response)) {
    return
  }

  if (payloads.length >= MAX_CAPTURED_NETWORK_RESPONSES) {
    return
  }

  try {
    const headers = response.headers?.() || {}
    const contentLength = Number.parseInt(headers['content-length'] || '', 10)
    if (Number.isFinite(contentLength) && contentLength > MAX_CAPTURED_RESPONSE_BYTES) {
      return
    }

    const raw = await response.text()
    if (!raw) {
      return
    }

    const trimmed = raw.slice(0, MAX_CAPTURED_RESPONSE_BYTES)
    const contentType = String(headers['content-type'] || '').toLowerCase()

    if (contentType.includes('text/html')) {
      payloads.push(buildHighFidelityHtmlTextSnapshot(trimmed))
      return
    }

    if (
      contentType.includes('application/json') ||
      contentType.includes('application/ld+json')
    ) {
      try {
        payloads.push(JSON.parse(trimmed))
        return
      } catch {
        // Fall back to raw text when JSON parsing fails.
      }
    }

    payloads.push(trimmed)
  } catch {
    // Ignore response bodies we cannot read.
  }
}

export async function extractRenderedPageContent(
  url: string
): Promise<RenderedPageContentResult> {
  const platform = detectPlatform(url)
  let browser: any = null

  try {
    const { playwright: pw, chromium: ch } = await loadPlaywrightDependencies()
    const launchOptions: any = {
      headless: true,
      args: isServerless() && ch ? ch.default.args : [],
    }

    if (isServerless() && ch) {
      launchOptions.executablePath = await ch.default.executablePath()
    }

    browser = await pw.chromium.launch(launchOptions)
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
      deviceScaleFactor: 1,
    })
    const networkPayloads: unknown[] = []
    const networkCaptureTasks: Array<Promise<void>> = []

    page.on('response', (response: any) => {
      const task = captureNetworkPayload(response, networkPayloads)
      networkCaptureTasks.push(task)
    })

    await page.setExtraHTTPHeaders({
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    })

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    await dismissPopups(page, platform)
    await waitForMeaningfulContent(page)
    await page.waitForTimeout(400)
    await Promise.race([
      Promise.allSettled(networkCaptureTasks),
      page.waitForTimeout(NETWORK_CAPTURE_TIMEOUT_MS),
    ])

    const html = await page.content()
    const title = await page.title()
    const domSnapshot = buildHighFidelityHtmlTextSnapshot(html, { title })
    const networkTextSnapshot = buildSourceTextSnapshotFromPayloads(
      networkPayloads
    )
    const combinedSnapshot = buildSourceTextSnapshotFromSegments([
      domSnapshot,
      networkTextSnapshot,
    ])
    const blockerSignals = detectSourceBlockerSignals([
      title,
      domSnapshot,
      networkTextSnapshot,
    ])
    const evidenceKinds: SourceEvidenceKind[] = ['rendered-html']

    if (networkTextSnapshot) {
      evidenceKinds.push('rendered-network')
    }

    if (isWeakSourceTextSnapshot(combinedSnapshot)) {
      return {
        success: false,
        platform,
        blockerSignals,
        error: 'Rendered page content remained weak after browser recovery',
      }
    }

    return {
      success: true,
      platform,
      html,
      title,
      networkTextSnapshot: networkTextSnapshot || undefined,
      networkResponseCount: networkPayloads.length || undefined,
      networkTextBytes: networkTextSnapshot
        ? Buffer.byteLength(networkTextSnapshot, 'utf8')
        : undefined,
      blockerSignals,
      evidenceKinds,
    }
  } catch (error) {
    return {
      success: false,
      platform,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await browser?.close().catch(() => {})
  }
}
