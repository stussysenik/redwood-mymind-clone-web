import { sanitizeGeneratedTags, stripGeneratedTagNoise } from './semantic'

describe('stripGeneratedTagNoise', () => {
  it('removes instagram shortcodes without inventing replacement tags', () => {
    expect(
      stripGeneratedTagNoise(
        ['fashion', 'visual', 'DWpk9jeDPnE', 'saturated'],
        {
          platform: 'instagram',
          url: 'https://www.instagram.com/p/DWpk9jeDPnE/?img_index=1',
        }
      )
    ).toEqual(['fashion', 'visual', 'saturated'])
  })

  it('removes social author handles from persisted tags', () => {
    expect(
      stripGeneratedTagNoise(
        ['langsmith', 'conversation', 'dense'],
        {
          platform: 'twitter',
          authorHandle: 'langsmith',
        }
      )
    ).toEqual(['conversation', 'dense'])
  })
})

describe('sanitizeGeneratedTags', () => {
  it('removes instagram shortcodes from generated tags', () => {
    expect(
      sanitizeGeneratedTags(
        ['fashion', 'visual', 'DWpk9jeDPnE', 'saturated'],
        {
          contentType: 'image',
          platform: 'instagram',
          url: 'https://www.instagram.com/p/DWpk9jeDPnE/?img_index=1',
        }
      )
    ).toEqual(['fashion', 'visual', 'saturated'])
  })

  it('uses visual fallback tags when instagram cleanup drops below the minimum', () => {
    expect(
      sanitizeGeneratedTags(
        ['visual', 'DWpk9jeDPnE', 'saturated'],
        {
          contentType: 'social',
          platform: 'instagram',
          url: 'https://www.instagram.com/p/DWpk9jeDPnE/?img_index=1',
        }
      )
    ).toEqual(['visual', 'composition', 'saturated'])
  })

  it('removes social author handles from generated tags', () => {
    expect(
      sanitizeGeneratedTags(
        ['langsmith', 'conversation', 'dense'],
        {
          contentType: 'social',
          platform: 'twitter',
          authorHandle: 'langsmith',
        }
      )
    ).toEqual(['conversation', 'public-note', 'dense'])
  })
})
