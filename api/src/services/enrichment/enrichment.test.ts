import { buildScrapedCardUpdate } from './enrichment'

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
})
