import {
  buildHeuristicSourceTitle,
  isWeakTitle,
  pickBestTitleCandidate,
} from './titleOptimization'

describe('titleOptimization', () => {
  it('prefers strong DSPy titles over untitled placeholders', () => {
    const selection = pickBestTitleCandidate([
      { title: 'Untitled', source: 'existing' },
      { title: 'Untitled note', source: 'local-ai' },
      {
        title: 'Designing Faster Review Loops for Product Teams',
        source: 'dspy',
        confidence: 0.92,
      },
      { title: 'Saved item', source: 'heuristic' },
    ])

    expect(selection.selected).toMatchObject({
      title: 'Designing Faster Review Loops for Product Teams',
      source: 'dspy',
    })
  })

  it('builds a source-aware heuristic title before falling back to a URL slug', () => {
    expect(
      buildHeuristicSourceTitle({
        content:
          '@ada Building a visual research system that keeps titles memorable',
        summary: null,
        url: 'https://example.com/posts/better-saved-titles',
        author: '@ada',
      })
    ).toBe('Building a visual research system that keeps titles memorable')
  })

  it('treats generic placeholders as weak titles', () => {
    expect(isWeakTitle('Untitled')).toBe(true)
    expect(isWeakTitle('https://example.com')).toBe(true)
    expect(isWeakTitle('Meaningful saved reference')).toBe(false)
  })
})
