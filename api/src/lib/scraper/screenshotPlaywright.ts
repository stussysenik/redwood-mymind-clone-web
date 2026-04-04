/**
 * BYOA - Playwright Screenshot Capture Module
 *
 * Self-hosted screenshot capture using Playwright with content-focused selectors.
 *
 * Features:
 * - Zero API costs (Playwright-based, runs on Vercel serverless)
 * - Platform-specific viewport optimization (YouTube, Instagram, Twitter, etc.)
 * - Content-focused capture (selectors for main content, not thumbnails/ads)
 * - Retina/HiDPI support (2x pixel density)
 * - Serverless-optimized (uses @sparticuz/chromium on Vercel)
 * - Graceful fallback to Microlink on failure
 *
 * @fileoverview Self-hosted screenshot capture with Playwright
 */

import { buildMicrolinkScreenshotUrl } from './fallbackPreview'

// =============================================================================
// PLATFORM DETECTION (inlined to avoid cross-boundary dependency)
// =============================================================================

type Platform =
  | 'twitter'
  | 'mastodon'
  | 'instagram'
  | 'youtube'
  | 'reddit'
  | 'letterboxd'
  | 'imdb'
  | 'goodreads'
  | 'amazon'
  | 'storygraph'
  | 'spotify'
  | 'github'
  | 'tiktok'
  | 'linkedin'
  | 'pinterest'
  | 'medium'
  | 'substack'
  | 'perplexity'
  | 'unknown'

function detectPlatform(url: string | null | undefined): Platform {
  if (!url) return 'unknown'
  const u = url.toLowerCase()
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter'
  if (
    u.includes('mastodon') ||
    u.includes('mathstodon') ||
    u.includes('fosstodon') ||
    u.includes('hachyderm.io')
  )
    return 'mastodon'
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('reddit.com')) return 'reddit'
  if (u.includes('letterboxd.com')) return 'letterboxd'
  if (u.includes('imdb.com')) return 'imdb'
  if (u.includes('spotify.com')) return 'spotify'
  if (u.includes('github.com')) return 'github'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('linkedin.com')) return 'linkedin'
  if (u.includes('pinterest.com') || u.includes('pin.it')) return 'pinterest'
  if (u.includes('medium.com')) return 'medium'
  if (u.includes('substack.com')) return 'substack'
  if (u.includes('goodreads.com')) return 'goodreads'
  if (
    u.includes('amazon.com') ||
    u.includes('amazon.co') ||
    u.includes('amzn.')
  )
    return 'amazon'
  if (u.includes('thestorygraph.com') || u.includes('storygraph.com'))
    return 'storygraph'
  if (u.includes('perplexity.ai')) return 'perplexity'
  return 'unknown'
}

// Dynamic imports for Playwright (loaded only when needed)
let chromium: any = null
let playwright: any = null

// =============================================================================
// TYPES
// =============================================================================

/**
 * Screenshot capture result
 */
export interface PlaywrightScreenshotResult {
  buffer: Buffer
  platform: Platform
  success: boolean
  error?: string
}

/**
 * Platform-specific configuration with content selectors
 */
interface PlatformConfig {
  viewport_width: number
  viewport_height: number
  device_scale_factor?: number
  full_page?: boolean
  delay?: number
  selector?: string
  fallback_full_viewport?: boolean
}

// =============================================================================
// POPUP DISMISSAL CONFIGURATION
// =============================================================================

interface PopupDismissalConfig {
  selectors: string[]
  scrollToContent?: string
  waitAfter?: number
  hideCSS?: string
}

const POPUP_CONFIGS: Partial<Record<Platform, PopupDismissalConfig>> = {
  twitter: {
    selectors: [
      '[data-testid="sheetDialog"] [aria-label="Close"]',
      '[role="dialog"] [data-testid="app-bar-close"]',
      '[data-testid="app-bar-close"]',
      '[data-testid="BottomBar"] button[aria-label="Close"]',
      '[data-testid="BottomBar"] [role="button"]',
      'div[data-testid="BottomBar"]',
      '[data-testid="signup-bar-close-button"]',
      '[data-testid="cookie-policy-banner"] button',
      '[role="dialog"] button[aria-label="Close"]',
      '[role="alertdialog"] button[aria-label="Close"]',
      'button[data-testid="confirmationSheetCancel"]',
    ],
    scrollToContent: 'article[data-testid="tweet"]',
    waitAfter: 500,
    hideCSS: `
			[data-testid="BottomBar"],
			[data-testid="sheetDialog"],
			[role="dialog"][aria-modal="true"],
			div[class*="BottomBar"],
			div[class*="SignupBanner"] {
				display: none !important;
				visibility: hidden !important;
			}
		`,
  },
  instagram: {
    selectors: [
      'button[aria-label="Close"]',
      'svg[aria-label="Close"]',
      'button:has-text("Not now")',
      'button:has-text("Not Now")',
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
      '[role="dialog"] button[aria-label="Close"]',
    ],
    scrollToContent: 'article[role="presentation"]',
    waitAfter: 500,
  },
  reddit: {
    selectors: [
      'button[aria-label="Close"]',
      'button:has-text("Accept all")',
      'button:has-text("Continue")',
    ],
    scrollToContent: 'shreddit-post, .Post',
    waitAfter: 300,
  },
  linkedin: {
    selectors: [
      'button[aria-label="Dismiss"]',
      'button:has-text("Sign in")',
      'button:has-text("Accept")',
    ],
    scrollToContent: '.feed-shared-update-v2',
    waitAfter: 500,
  },
  tiktok: {
    selectors: [
      'button:has-text("Accept all")',
      '[data-e2e="modal-close-inner-button"]',
    ],
    scrollToContent: 'div[data-e2e="browse-video"]',
    waitAfter: 1000,
  },
  perplexity: {
    selectors: [
      'button[aria-label="Close"]',
      'button[aria-label="close"]',
      '[role="dialog"] button:has(svg)',
      'button:has-text("Maybe later")',
      'button:has-text("Continue")',
      'button:has-text("Skip")',
      'button:has-text("Accept")',
      '[class*="modal"] button:first-child',
      '[class*="Modal"] button:first-child',
    ],
    scrollToContent: '[class*="answer"], [class*="response"], main',
    waitAfter: 500,
    hideCSS: `
			[role="dialog"],
			[class*="modal"],
			[class*="Modal"],
			[class*="overlay"],
			[class*="Overlay"] {
				display: none !important;
				visibility: hidden !important;
			}
		`,
  },
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig | null> = {
  youtube: {
    viewport_width: 1920,
    viewport_height: 1080,
    device_scale_factor: 2,
    full_page: false,
    delay: 2000,
    selector: '#movie_player, #player',
  },
  instagram: {
    viewport_width: 375,
    viewport_height: 812,
    device_scale_factor: 2,
    full_page: false,
    delay: 2000,
    selector: 'article[role="presentation"], article',
  },
  twitter: {
    viewport_width: 550,
    viewport_height: 800,
    device_scale_factor: 2,
    full_page: false,
    delay: 2000,
    selector: 'article[data-testid="tweet"]',
    fallback_full_viewport: true,
  },
  tiktok: {
    viewport_width: 375,
    viewport_height: 812,
    device_scale_factor: 2,
    full_page: false,
    delay: 2000,
    selector: 'div[data-e2e="browse-video"]',
  },
  linkedin: {
    viewport_width: 1200,
    viewport_height: 800,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: '.feed-shared-update-v2, article',
  },
  reddit: {
    viewport_width: 1920,
    viewport_height: 1080,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: 'shreddit-post, .Post',
  },
  pinterest: {
    viewport_width: 1200,
    viewport_height: 1600,
    device_scale_factor: 2,
    full_page: true,
    delay: 1000,
    selector: '[data-test-id="pin"], [data-test-id="pinrep-image"]',
  },
  medium: {
    viewport_width: 1200,
    viewport_height: 1600,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: 'article',
  },
  substack: {
    viewport_width: 1200,
    viewport_height: 1600,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: '.post-content, article',
  },
  github: {
    viewport_width: 1920,
    viewport_height: 1080,
    device_scale_factor: 2,
    full_page: false,
    delay: 500,
    selector: '.repository-content, #repo-content-pjax-container',
  },
  mastodon: {
    viewport_width: 1200,
    viewport_height: 800,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: '.status, article',
  },
  letterboxd: {
    viewport_width: 1200,
    viewport_height: 1600,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: '.film-detail, .poster',
  },
  imdb: {
    viewport_width: 1920,
    viewport_height: 1080,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: '[data-testid="hero-media"], .ipc-page-content-container',
  },
  goodreads: {
    viewport_width: 1200,
    viewport_height: 1600,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: '.BookPage, #topcol',
  },
  amazon: {
    viewport_width: 1920,
    viewport_height: 1080,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: '#dp-container, #ppd',
  },
  storygraph: {
    viewport_width: 1200,
    viewport_height: 1600,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: '.book-page-book-pane, .main-content',
  },
  spotify: {
    viewport_width: 1920,
    viewport_height: 1080,
    device_scale_factor: 2,
    full_page: false,
    delay: 1000,
    selector: '[data-testid="entity-page"], main',
  },
  perplexity: {
    viewport_width: 430,
    viewport_height: 932,
    device_scale_factor: 2,
    full_page: false,
    delay: 3000,
    selector: '[class*="answer"], [class*="response"], [class*="Answer"], main',
    fallback_full_viewport: true,
  },
  unknown: {
    viewport_width: 1920,
    viewport_height: 1080,
    device_scale_factor: 2,
    full_page: false,
    delay: 500,
    selector: 'main, article, [role="main"]',
    fallback_full_viewport: true,
  },
}

const DEFAULT_CONFIG: PlatformConfig = {
  viewport_width: 1920,
  viewport_height: 1080,
  device_scale_factor: 2,
  full_page: false,
  delay: 500,
  fallback_full_viewport: true,
}

const MEANINGFUL_CONTENT_TIMEOUT_MS = 4000
const MEANINGFUL_TEXT_MIN_LENGTH = 80
const MEANINGFUL_BODY_TEXT_MIN_LENGTH = 120
const MEANINGFUL_MEDIA_MIN_SIZE = 120

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getPlatformConfig(url: string): PlatformConfig {
  const platform = detectPlatform(url)
  return PLATFORM_CONFIGS[platform] ?? DEFAULT_CONFIG
}

function isServerless(): boolean {
  return !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
}

async function loadPlaywrightDependencies() {
  if (!playwright || !chromium) {
    if (isServerless()) {
      chromium = await import('@sparticuz/chromium')
      playwright = await import('playwright-core')
    } else {
      playwright = await import('playwright')
    }
  }
  return { playwright, chromium }
}

// =============================================================================
// POPUP DISMISSAL
// =============================================================================

async function dismissPopups(page: any, platform: Platform): Promise<boolean> {
  const config = POPUP_CONFIGS[platform]
  if (!config) return false

  let dismissed = false

  for (const selector of config.selectors) {
    try {
      const element = page.locator(selector).first()
      const isVisible = await element
        .isVisible({ timeout: 1000 })
        .catch(() => false)

      if (isVisible) {
        console.log(`[Screenshot] Dismissing popup: ${selector}`)
        await element.click({ timeout: 2000 }).catch(() => {})
        dismissed = true
        await page.waitForTimeout(300)
      }
    } catch {
      // Selector not found or not visible, continue to next
    }
  }

  if (config.hideCSS) {
    try {
      await page.addStyleTag({ content: config.hideCSS })
      console.log(`[Screenshot] Injected hide CSS for ${platform}`)
      dismissed = true
    } catch {
      // CSS injection failed, continue anyway
    }
  }

  if (dismissed && config.scrollToContent) {
    try {
      const contentElement = page.locator(config.scrollToContent).first()
      await contentElement.scrollIntoViewIfNeeded({ timeout: 2000 })
    } catch {
      // Content element not found, continue anyway
    }
  }

  if (dismissed && config.waitAfter) {
    await page.waitForTimeout(config.waitAfter)
  }

  return dismissed
}

async function waitForMeaningfulContent(
  page: any,
  platform: Platform,
  selector?: string
): Promise<void> {
  const targetSelector =
    selector ||
    POPUP_CONFIGS[platform]?.scrollToContent ||
    'main, article, [role="main"], body'

  try {
    await page.waitForFunction(
      ({
        targetSelector,
        textThreshold,
        bodyTextThreshold,
        mediaMinSize,
      }: {
        targetSelector: string
        textThreshold: number
        bodyTextThreshold: number
        mediaMinSize: number
      }) => {
        const doc = (globalThis as any).document
        const bodyText = (doc?.body?.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
        const candidates = Array.from(doc?.querySelectorAll(targetSelector) || [])
        const nodes = candidates.length > 0 ? candidates : [doc?.body]

        return (
          nodes.some((node) => {
            const element = node as any
            if (!element) {
              return false
            }

            const rect = element.getBoundingClientRect()
            if (rect.width < 40 || rect.height < 40) {
              return false
            }

            const text = (element.innerText || '').replace(/\s+/g, ' ').trim()
            if (text.length >= textThreshold) {
              return true
            }

            const hasLoadedImage = Array.from(
              element.querySelectorAll('img')
            ).some((img) => {
              const htmlImage = img as any
              return (
                htmlImage.complete &&
                htmlImage.naturalWidth >= mediaMinSize &&
                htmlImage.naturalHeight >= mediaMinSize
              )
            })
            if (hasLoadedImage) {
              return true
            }

            return !!element.querySelector('video, canvas, svg')
          }) || bodyText.length >= bodyTextThreshold
        )
      },
      {
        targetSelector,
        textThreshold: MEANINGFUL_TEXT_MIN_LENGTH,
        bodyTextThreshold: MEANINGFUL_BODY_TEXT_MIN_LENGTH,
        mediaMinSize: MEANINGFUL_MEDIA_MIN_SIZE,
      },
      {
        timeout: MEANINGFUL_CONTENT_TIMEOUT_MS,
      }
    )
  } catch (error) {
    console.warn(
      `[Screenshot] Meaningful content wait timed out for ${platform}:`,
      error
    )
  }
}

// =============================================================================
// CORE SCREENSHOT FUNCTIONS
// =============================================================================

/**
 * Capture screenshot using Playwright
 */
export async function captureWithPlaywright(
  url: string
): Promise<PlaywrightScreenshotResult> {
  const platform = detectPlatform(url)
  const config = getPlatformConfig(url)

  try {
    const { playwright: pw, chromium: ch } = await loadPlaywrightDependencies()

    const launchOptions: any = {
      headless: true,
      args: isServerless() && ch ? ch.default.args : [],
    }

    if (isServerless() && ch) {
      launchOptions.executablePath = await ch.default.executablePath()
    }

    console.log(
      `[Screenshot] Launching Playwright for ${platform} (serverless: ${isServerless()})`
    )

    const browser = await pw.chromium.launch(launchOptions)

    const page = await browser.newPage({
      viewport: {
        width: config.viewport_width,
        height: config.viewport_height,
      },
      deviceScaleFactor: config.device_scale_factor ?? 2,
    })

    await page.setExtraHTTPHeaders({
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    console.log(`[Screenshot] Navigating to ${url}`)
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    if (config.delay) {
      await page.waitForTimeout(config.delay)
    }

    const popupsDismissed = await dismissPopups(page, platform)
    if (popupsDismissed) {
      console.log(
        `[Screenshot] Dismissed popups for ${platform}, waiting for content to stabilize`
      )
      await page.waitForTimeout(500)
    }

    await waitForMeaningfulContent(
      page,
      platform,
      config.selector ?? POPUP_CONFIGS[platform]?.scrollToContent
    )

    let screenshot: Buffer

    if (config.selector) {
      try {
        console.log(`[Screenshot] Trying selector: ${config.selector}`)
        const element = page.locator(config.selector).first()
        await element.waitFor({ state: 'visible', timeout: 5000 })
        screenshot = await element.screenshot({ type: 'png' })
        console.log(`[Screenshot] Captured element screenshot for ${platform}`)
      } catch (selectorError) {
        console.warn(
          `[Screenshot] Selector failed for ${platform}:`,
          selectorError
        )

        if (config.fallback_full_viewport) {
          console.log(
            `[Screenshot] Falling back to full viewport for ${platform}`
          )
          screenshot = await page.screenshot({
            type: 'png',
            fullPage: false,
          })
        } else {
          console.log(`[Screenshot] Falling back to full page for ${platform}`)
          screenshot = await page.screenshot({
            type: 'png',
            fullPage: config.full_page ?? false,
          })
        }
      }
    } else {
      screenshot = await page.screenshot({
        type: 'png',
        fullPage: config.full_page ?? false,
      })
      console.log(
        `[Screenshot] Captured ${config.full_page ? 'full page' : 'viewport'} screenshot for ${platform}`
      )
    }

    await browser.close()

    return {
      buffer: screenshot,
      platform,
      success: true,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Screenshot] Playwright failed for ${platform}:`, errorMsg)

    return {
      buffer: Buffer.from(''),
      platform,
      success: false,
      error: errorMsg,
    }
  }
}

/**
 * Get Microlink fallback URL
 */
export function getMicrolinkFallback(url: string): string | null {
  return buildMicrolinkScreenshotUrl(url)
}

/**
 * Check if Playwright is available
 */
export function isPlaywrightAvailable(): boolean {
  try {
    require.resolve('playwright-core')
    return true
  } catch {
    return false
  }
}
