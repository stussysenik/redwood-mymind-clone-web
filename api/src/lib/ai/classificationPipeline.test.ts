import { AESTHETIC_VOCABULARY } from './prompts/classification'
import {
  generateFallbackTags,
  normalizeTags,
  validateClassification,
} from './classificationPipeline'

describe('classificationPipeline validation', () => {
  it('normalizes generic-only tags into canonical fallback tags', () => {
    const result = validateClassification({
      type: 'article',
      title: 'Example',
      summary: 'A short summary',
      tags: ['website', 'link'],
    })

    const normalized = normalizeTags(['website', 'link'], 'article')

    expect(result.valid).toBe(true)
    expect(normalized.some((tag) => AESTHETIC_VOCABULARY.includes(tag))).toBe(
      true
    )
    expect(normalized.some((tag) => !AESTHETIC_VOCABULARY.includes(tag))).toBe(
      true
    )
  })

  it('accepts classifications with at least one specific tag', () => {
    const result = validateClassification({
      type: 'article',
      title: 'Example',
      summary: 'A short summary',
      tags: ['website', 'dark-mode'],
    })

    expect(result.valid).toBe(true)
  })
})

describe('generateFallbackTags', () => {
  it('returns usable fallback tags with an aesthetic tag', () => {
    const result = generateFallbackTags(
      'https://example.com/posts/design-system',
      'A short note about interface systems and AI tooling',
      'Design systems post',
      'https://example.com/image.jpg'
    )

    expect(result.tags.length).toBeGreaterThan(0)
    expect(result.tags.some((tag) => AESTHETIC_VOCABULARY.includes(tag))).toBe(
      true
    )
    expect(result.title).toBeTruthy()
    expect(result.summary).toBeTruthy()
  })
})
