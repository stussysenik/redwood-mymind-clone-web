import { scrapeUrl } from 'api/src/lib/scraper/scraper'
import { diagnoseInstagramUrl } from 'api/src/lib/scraper/instagramExtractor'
import { buildMicrolinkScreenshotUrl } from 'api/src/lib/scraper/fallbackPreview'

function isInstagramUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes('instagram.com')
  } catch {
    return false
  }
}

export default async () => {
  const rawArgs = process.argv.slice(2)
  const aggressive = rawArgs.includes('--aggressive')
  const urls = rawArgs.filter((value) => /^https?:\/\//i.test(value))

  if (urls.length === 0) {
    console.error(
      'Usage: yarn rw exec diagnoseVisualExtraction -- [--aggressive] <url> [more urls]'
    )
    process.exitCode = 1
    return
  }

  for (const url of urls) {
    console.log(`\n=== ${url} ===`)

    try {
      const scraped = await scrapeUrl(url, {
        aggressiveBrowserAcquisition: aggressive,
        recoveryReason: aggressive ? 'diagnostic-aggressive' : undefined,
      })
      const report: Record<string, unknown> = {
        url,
        aggressive,
        scraped: {
          title: scraped.title,
          domain: scraped.domain,
          imageUrl: scraped.imageUrl,
          images: scraped.images?.length || 0,
          mediaTypes: scraped.mediaTypes || [],
          videoPositions: scraped.videoPositions || [],
          previewSource: scraped.previewSource || null,
          sourcePayloadBytes: scraped.sourcePayloadBytes || null,
          sourcePayloadKind: scraped.sourcePayloadKind || null,
          sourceTextBytes: scraped.sourceTextBytes || null,
          sourceTextKind: scraped.sourceTextKind || null,
          sourceTextCoverageTarget: scraped.sourceTextCoverageTarget || null,
          sourceEvidenceKinds: scraped.sourceEvidenceKinds || null,
          blockerSignals: scraped.blockerSignals || null,
          renderedNetworkResponseCount:
            scraped.renderedNetworkResponseCount || null,
          renderedNetworkTextBytes: scraped.renderedNetworkTextBytes || null,
          recoverySource: scraped.recoverySource || null,
          recoveryReason: scraped.recoveryReason || null,
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
