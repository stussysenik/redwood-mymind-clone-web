import {
  annotateAggressiveRecoveryMetrics,
  buildScrapedCardUpdate,
  isScrapedUpdateMateriallyBetter,
  mergeGeneratedCardTags,
  shouldEscalateScrapeAcquisition,
} from './enrichment'

describe('buildScrapedCardUpdate', () => {
  it('persists scraped title, image and metadata even when content is thin', () => {
    const update = buildScrapedCardUpdate(
      {
        title: 'Link',
        content: null,
        imageUrl: null,
        url: 'https://example.com/post',
        metadata: {
          processing: true,
        },
      },
      {
        title: 'Visual system teardown',
        content: 'Short caption',
        imageUrl: 'https://example.com/hero.jpg',
        images: [
          'https://example.com/hero.jpg',
          'https://example.com/detail.jpg',
        ],
        domain: 'example.com',
        url: 'https://example.com/post',
        authorName: 'Ada',
        hashtags: ['design', 'ui'],
      sourcePayloadBytes: 100,
      sourcePayloadKind: 'api-json',
      sourceTextBytes: 35,
      sourceTextKind: 'api-text',
      sourceTextCoverageTarget: 0.8,
      }
    )

    expect(update.content).toBe('Short caption')
    expect(update.title).toBe('Visual system teardown')
    expect(update.imageUrl).toBe('https://example.com/hero.jpg')
    expect(update.analysisContent).toBe('Short caption')
    expect(update.analysisImageUrl).toBe('https://example.com/hero.jpg')
    expect(update.imageCount).toBe(2)
    expect(update.metadata.scrapedTitle).toBe('Visual system teardown')
    expect(update.metadata.scrapedImageUrl).toBe('https://example.com/hero.jpg')
    expect(update.metadata.images).toEqual([
      'https://example.com/hero.jpg',
      'https://example.com/detail.jpg',
    ])
    expect(update.metadata.authorName).toBe('Ada')
    expect(update.metadata.scrapedAt).toEqual(expect.any(String))
    expect(update.metadata.extractionMetrics).toEqual({
      sourceDomain: 'example.com',
      sourceUrl: 'https://example.com/post',
      extractedTextBytes: {
        title: 22,
        description: 0,
        content: 13,
        total: 35,
        uniqueTotal: 35,
      },
      sourcePayloadBytes: 100,
      sourcePayloadKind: 'api-json',
      sourceTextBytes: 35,
      sourceTextKind: 'api-text',
      sourceEvidenceKinds: ['api-json'],
      blockerSignals: undefined,
      renderedNetworkResponseCount: undefined,
      renderedNetworkTextBytes: undefined,
      textCoverageRatio: 1,
      payloadTextDensityRatio: 0.35,
      sourceTextCoverageTarget: 0.8,
      coverageTargetMet: true,
      extractedImageCount: 2,
      hashtagCount: 2,
      mentionCount: 0,
      recoverySource: undefined,
      recoveryReason: undefined,
      aggressiveRecoveryAttempted: undefined,
      aggressiveRecoveryReason: undefined,
      aggressiveRecoveryApplied: undefined,
      savedPreviewSource: null,
      savedPreviewKind: 'source-media',
    })
  })

  it('uses the freshest scraped image for classification without overwriting an existing one', () => {
    const update = buildScrapedCardUpdate(
      {
        title: 'Saved item',
        content: 'Existing card body',
        imageUrl: 'https://example.com/old.jpg',
        url: 'https://example.com/post',
        metadata: {},
      },
      {
        title: 'Updated visual story',
        imageUrl: 'https://example.com/new.jpg',
        content: '',
        domain: 'example.com',
        url: 'https://example.com/post',
      }
    )

    expect(update.imageUrl).toBeUndefined()
    expect(update.analysisImageUrl).toBe('https://example.com/new.jpg')
    expect(update.analysisContent).toBe('Updated visual story')
    expect(update.title).toBe('Updated visual story')
  })

  it('promotes a screenshot fallback when scraping yields no image asset', () => {
    const update = buildScrapedCardUpdate(
      {
        title: 'Link',
        content: null,
        imageUrl: null,
        url: 'https://example.com/post',
        metadata: {},
      },
      {
        title: 'Example Domain',
        content: 'Example description',
        imageUrl: null,
        domain: 'example.com',
        url: 'https://example.com/post',
        sourcePayloadBytes: 80,
        sourcePayloadKind: 'html',
        sourceTextBytes: 33,
        sourceTextKind: 'compressed-visible-html',
        sourceTextCoverageTarget: 0.8,
      }
    )

    expect(update.imageUrl).toBe(
      'https://api.microlink.io/?url=https%3A%2F%2Fexample.com%2Fpost&screenshot=true&meta=false&embed=screenshot.url&delay=3000&waitUntil=networkidle'
    )
    expect(update.analysisImageUrl).toBe(update.imageUrl)
    expect(update.metadata.previewSource).toBe('microlink')
    expect(update.metadata.scrapedImageUrl).toBe(update.imageUrl)
    expect(update.metadata.extractionMetrics).toEqual({
      sourceDomain: 'example.com',
      sourceUrl: 'https://example.com/post',
      extractedTextBytes: {
        title: 14,
        description: 19,
        content: 19,
        total: 52,
        uniqueTotal: 33,
      },
      sourcePayloadBytes: 80,
      sourcePayloadKind: 'html',
      sourceTextBytes: 33,
      sourceTextKind: 'compressed-visible-html',
      sourceEvidenceKinds: ['static-html'],
      blockerSignals: undefined,
      renderedNetworkResponseCount: undefined,
      renderedNetworkTextBytes: undefined,
      textCoverageRatio: 1,
      payloadTextDensityRatio: 0.4125,
      sourceTextCoverageTarget: 0.8,
      coverageTargetMet: true,
      extractedImageCount: 1,
      hashtagCount: 0,
      mentionCount: 0,
      recoverySource: undefined,
      recoveryReason: undefined,
      aggressiveRecoveryAttempted: undefined,
      aggressiveRecoveryReason: undefined,
      aggressiveRecoveryApplied: undefined,
      savedPreviewSource: 'microlink',
      savedPreviewKind: 'fallback-screenshot',
    })
  })

  it('persists Instagram media metadata for mixed carousels', () => {
    const update = buildScrapedCardUpdate(
      {
        title: 'Link',
        content: null,
        imageUrl: null,
        url: 'https://www.instagram.com/p/ABC123/',
        metadata: {},
      },
      {
        title: 'Carousel title',
        content: 'Caption',
        imageUrl: 'https://cdn.example.com/1.jpg',
        images: [
          'https://cdn.example.com/1.jpg',
          'https://cdn.example.com/2.jpg',
          'https://cdn.example.com/3.jpg',
        ],
        mediaTypes: ['image', 'video', 'image'],
        videoPositions: [1],
        previewSource: 'instagram-api',
        previewAspectRatio: '1 / 1',
        domain: 'instagram.com',
        url: 'https://www.instagram.com/p/ABC123/',
      }
    )

    expect(update.metadata.images).toEqual([
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/2.jpg',
      'https://cdn.example.com/3.jpg',
    ])
    expect(update.metadata.mediaTypes).toEqual(['image', 'video', 'image'])
    expect(update.metadata.videoPositions).toEqual([1])
    expect(update.metadata.isCarousel).toBe(true)
    expect(update.metadata.carouselExtracted).toBe(true)
    expect(update.metadata.previewSource).toBe('instagram-api')
    expect(update.metadata.previewAspectRatio).toBe('1 / 1')
    expect(update.imageCount).toBe(3)
  })

  it('tracks deduplicated text coverage when the scraper reports source payload bytes', () => {
    const update = buildScrapedCardUpdate(
      {
        title: 'Untitled',
        content: null,
        imageUrl: null,
        url: 'https://example.com/article',
        metadata: {},
      },
      {
        title: 'Precision Extraction',
        description: 'Key source text',
        content: 'Key source text',
        domain: 'example.com',
        url: 'https://example.com/article',
        sourcePayloadBytes: 64,
        sourcePayloadKind: 'html',
        sourceTextBytes: 33,
        sourceTextKind: 'compressed-visible-html',
        sourceTextCoverageTarget: 0.8,
      }
    )

    expect(update.metadata.extractionMetrics).toMatchObject({
      extractedTextBytes: {
        title: 18,
        description: 15,
        content: 15,
        total: 48,
        uniqueTotal: 33,
      },
      sourcePayloadBytes: 64,
      sourcePayloadKind: 'html',
      sourceTextBytes: 33,
      sourceTextKind: 'compressed-visible-html',
      sourceEvidenceKinds: ['static-html'],
      textCoverageRatio: 1,
      payloadTextDensityRatio: 0.5156,
      sourceTextCoverageTarget: 0.8,
      coverageTargetMet: true,
    })
  })

  it('marks coverage misses and rendered recovery details when source text is still larger than extracted text', () => {
    const update = buildScrapedCardUpdate(
      {
        title: 'Link',
        content: null,
        imageUrl: null,
        url: 'https://example.com/story',
        metadata: {},
      },
      {
        title: 'Recovered Story',
        description: 'Short summary',
        content: 'Short summary',
        domain: 'example.com',
        url: 'https://example.com/story',
        sourcePayloadBytes: 400,
        sourcePayloadKind: 'rendered-html',
        sourceTextBytes: 120,
        sourceTextKind: 'rendered-visible-html',
        sourceTextCoverageTarget: 0.8,
        recoverySource: 'rendered-html',
        recoveryReason: 'weak-static-html',
      }
    )

    expect(update.metadata.extractionMetrics).toMatchObject({
      sourcePayloadBytes: 400,
      sourcePayloadKind: 'rendered-html',
      sourceTextBytes: 120,
      sourceTextKind: 'rendered-visible-html',
      sourceEvidenceKinds: ['rendered-html'],
      textCoverageRatio: 0.2167,
      payloadTextDensityRatio: 0.065,
      sourceTextCoverageTarget: 0.8,
      coverageTargetMet: false,
      recoverySource: 'rendered-html',
      recoveryReason: 'weak-static-html',
    })
  })

  it('persists blocker and browser-network acquisition diagnostics', () => {
    const update = buildScrapedCardUpdate(
      {
        title: 'Link',
        content: null,
        imageUrl: null,
        url: 'https://example.com/login-heavy',
        metadata: {},
      },
      {
        title: 'Recovered Story',
        description: 'Recovered body',
        content: 'Recovered body with captured browser payload text.',
        domain: 'example.com',
        url: 'https://example.com/login-heavy',
        sourcePayloadBytes: 700,
        sourcePayloadKind: 'rendered-html',
        sourceTextBytes: 220,
        sourceTextKind: 'browser-acquired-text',
        sourceEvidenceKinds: ['rendered-html', 'rendered-network'],
        blockerSignals: ['login-wall'],
        renderedNetworkResponseCount: 4,
        renderedNetworkTextBytes: 180,
        recoverySource: 'aggressive-browser',
        recoveryReason: 'blocker-signals',
      }
    )

    expect(update.metadata.extractionMetrics).toMatchObject({
      sourcePayloadKind: 'rendered-html',
      sourceTextKind: 'browser-acquired-text',
      sourceEvidenceKinds: ['rendered-html', 'rendered-network'],
      blockerSignals: ['login-wall'],
      renderedNetworkResponseCount: 4,
      renderedNetworkTextBytes: 180,
      recoverySource: 'aggressive-browser',
      recoveryReason: 'blocker-signals',
    })
  })
})

describe('acquisition escalation helpers', () => {
  it('escalates blocker-heavy first scrapes', () => {
    expect(
      shouldEscalateScrapeAcquisition({
        card: {
          title: 'Link',
          content: null,
          imageUrl: null,
          url: 'https://example.com',
          metadata: {},
        },
        update: {
          metadata: {
            extractionMetrics: {
              blockerSignals: ['login-wall'],
              coverageTargetMet: true,
            },
            scrapedTitle: 'Recovered',
          },
          analysisContent: 'Recovered content with enough text',
          analysisImageUrl: null,
          imageCount: 0,
        },
      })
    ).toBe('blocker-signals')
  })

  it('prefers materially better recovery updates', () => {
    expect(
      isScrapedUpdateMateriallyBetter(
        {
          metadata: {
            extractionMetrics: {
              textCoverageRatio: 0.9,
              blockerSignals: [],
            },
          },
          analysisContent: 'full content',
          analysisImageUrl: 'https://example.com/image.jpg',
          imageCount: 1,
          title: 'Strong title',
        },
        {
          metadata: {
            extractionMetrics: {
              textCoverageRatio: 0.3,
              blockerSignals: ['login-wall'],
            },
          },
          analysisContent: 'short',
          analysisImageUrl: null,
          imageCount: 0,
          title: 'Link',
        }
      )
    ).toBe(true)
  })

  it('annotates aggressive acquisition attempts even when the first scrape wins', () => {
    const annotated = annotateAggressiveRecoveryMetrics(
      {
        metadata: {
          extractionMetrics: {
            textCoverageRatio: 0.7,
          },
        },
        analysisContent: 'Recovered content',
        analysisImageUrl: null,
        imageCount: 0,
      },
      {
        attempted: true,
        reason: 'low-coverage',
        applied: false,
      }
    )

    expect(annotated.metadata.extractionMetrics).toMatchObject({
      textCoverageRatio: 0.7,
      aggressiveRecoveryAttempted: true,
      aggressiveRecoveryReason: 'low-coverage',
      aggressiveRecoveryApplied: false,
    })
  })
})

describe('mergeGeneratedCardTags', () => {
  it('repairs sticky AI-generated junk tags during re-enrichment', () => {
    expect(
      mergeGeneratedCardTags({
        currentTags: ['visual', 'DWpk9jeDPnE', 'saturated'],
        nextTags: ['fashion', 'visual', 'saturated'],
        metadata: {
          tagsSource: 'glm',
        },
        contentType: 'social',
        platform: 'instagram',
        url: 'https://www.instagram.com/p/DWpk9jeDPnE/?img_index=1',
      })
    ).toEqual(['visual', 'composition', 'saturated', 'fashion'])
  })

  it('leaves unknown-source existing tags untouched when merging', () => {
    expect(
      mergeGeneratedCardTags({
        currentTags: ['creator-handle', 'curated-tag'],
        nextTags: ['fresh-tag', 'editorial'],
        metadata: {},
        contentType: 'social',
        platform: 'twitter',
        url: 'https://x.com/example/status/1',
      })
    ).toEqual(['creator-handle', 'curated-tag', 'fresh-tag', 'editorial'])
  })

  it('normalizes legacy and user-entered tags during merge without dropping valid tags', () => {
    expect(
      mergeGeneratedCardTags({
        currentTags: ['#Design Systems', 'Creator Notes'],
        nextTags: ['design systems', 'Visual Reference'],
        metadata: {},
        contentType: 'article',
        platform: 'unknown',
        url: 'https://example.com/article',
      })
    ).toEqual(['design-systems', 'creator-notes', 'visual-reference'])
  })
})
