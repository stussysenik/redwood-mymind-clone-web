import { buildScrapedCardUpdate, mergeGeneratedCardTags } from './enrichment'

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
      }
    )

    expect(update.imageUrl).toBe(
      'https://api.microlink.io/?url=https%3A%2F%2Fexample.com%2Fpost&screenshot=true&meta=false&embed=screenshot.url'
    )
    expect(update.analysisImageUrl).toBe(update.imageUrl)
    expect(update.metadata.previewSource).toBe('microlink')
    expect(update.metadata.scrapedImageUrl).toBe(update.imageUrl)
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
})
