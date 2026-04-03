import { scrapeUrl } from 'api/src/lib/scraper/scraper'
import { diagnoseInstagramUrl } from 'api/src/lib/scraper/instagramExtractor'

function buildMicrolinkScreenshotUrl(url: string): string {
  return `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`
}

function isInstagramUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes('instagram.com')
  } catch {
    return false
  }
}

export default async () => {
  const urls = process.argv
    .slice(2)
    .filter((value) => /^https?:\/\//i.test(value))

  if (urls.length === 0) {
    console.error(
      'Usage: yarn rw exec diagnoseVisualExtraction -- <url> [more urls]'
    )
    process.exitCode = 1
    return
  }

  for (const url of urls) {
    console.log(`\n=== ${url} ===`)

    try {
      const scraped = await scrapeUrl(url)
      const report: Record<string, unknown> = {
        url,
        scraped: {
          title: scraped.title,
          domain: scraped.domain,
          imageUrl: scraped.imageUrl,
          images: scraped.images?.length || 0,
          mediaTypes: scraped.mediaTypes || [],
          videoPositions: scraped.videoPositions || [],
          previewSource: scraped.previewSource || null,
          fallbackPreview:
            scraped.imageUrl || !url.startsWith('http')
              ? null
              : buildMicrolinkScreenshotUrl(url),
        },
      }

      if (isInstagramUrl(url)) {
        report.instagram = await diagnoseInstagramUrl(url)
      }

      console.log(JSON.stringify(report, null, 2))
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            url,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      )
      process.exitCode = 1
    }
  }
}
