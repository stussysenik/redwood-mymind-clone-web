import {
  buildInitialLocalClassificationState,
  extractStoredLocalClassification,
  normalizeLocalClassification,
} from './localClassification'

describe('localClassification helpers', () => {
  it('normalizes valid browser local AI payloads', () => {
    expect(
      normalizeLocalClassification({
        type: 'article',
        title: 'System design teardown',
        tags: ['Design Systems', 'UI'],
        summary: 'A practical teardown of a design system rollout.',
        platform: 'unknown',
        source: 'local-ai',
      })
    ).toEqual({
      type: 'article',
      title: 'System design teardown',
      tags: ['design-systems', 'ui', 'article'],
      summary: 'A practical teardown of a design system rollout.',
      platform: 'unknown',
      source: 'local-ai',
    })
  })

  it('fills missing initial fields from local AI without overwriting explicit note types', () => {
    const state = buildInitialLocalClassificationState({
      inputType: 'note',
      inputTitle: null,
      inputTags: null,
      clientClassification: normalizeLocalClassification({
        type: 'article',
        title: 'Captured note',
        tags: ['Product Strategy', 'Memos'],
        summary: 'Personal notes about a product strategy memo.',
        source: 'local-ai',
      }),
    })

    expect(state.type).toBe('note')
    expect(state.title).toBe('Captured note')
    expect(state.tags).toEqual(['product-strategy', 'memos', 'article'])
    expect(state.metadata.summary).toBe(
      'Personal notes about a product strategy memo.'
    )
    expect(state.metadata.summarySource).toBe('local-ai')
    expect(state.metadata.tagsSource).toBe('local-ai')
    expect(state.metadata.titleSource).toBe('local-ai')
  })

  it('extracts stored local classification from the new metadata shape', () => {
    const classification = extractStoredLocalClassification({
      localClassification: {
        type: 'article',
        title: 'Saved locally',
        tags: ['Visual Research', 'Design'],
        summary: 'Recovered from metadata.',
        source: 'local-ai',
      },
    })

    expect(classification).toEqual({
      type: 'article',
      title: 'Saved locally',
      tags: ['visual-research', 'design', 'article'],
      summary: 'Recovered from metadata.',
      source: 'local-ai',
    })
  })
})
