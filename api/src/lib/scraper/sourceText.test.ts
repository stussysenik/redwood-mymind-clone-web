import {
  buildHighFidelityHtmlTextSnapshot,
  buildSourceTextSnapshotFromPayloads,
  buildSourceTextSnapshotFromSegments,
  detectSourceBlockerSignals,
  isWeakSourceTextSnapshot,
  measureSourceTextBytesFromPayloads,
  measureSourceTextBytesFromSegments,
} from './sourceText'

describe('sourceText helpers', () => {
  it('builds a compressed high-fidelity snapshot from meaningful HTML blocks', () => {
    const snapshot = buildHighFidelityHtmlTextSnapshot(`
      <html>
        <head>
          <title>System Notes</title>
          <meta name="description" content="Deep dive into resilient extraction." />
        </head>
        <body>
          <main>
            <h1>System Notes</h1>
            <p>Deep dive into resilient extraction and coverage-first scraping.</p>
            <p>Keep the most important source information without saving a pile of nav chrome.</p>
          </main>
          <div class="cookie-banner">Accept cookies</div>
        </body>
      </html>
    `)

    expect(snapshot).toContain('System Notes')
    expect(snapshot).toContain(
      'Deep dive into resilient extraction and coverage-first scraping.'
    )
    expect(snapshot).not.toContain('Accept cookies')
  })

  it('deduplicates repeated segments when building source text', () => {
    const snapshot = buildSourceTextSnapshotFromSegments([
      'Meaningful title',
      'Meaningful title',
      'Second segment',
    ])

    expect(snapshot).toBe('Meaningful title\n\nSecond segment')
  })

  it('flags very short snapshots as weak', () => {
    expect(isWeakSourceTextSnapshot('tiny note')).toBe(true)
    expect(
      isWeakSourceTextSnapshot(
        'This snapshot is long enough to count as meaningful source text for recovery checks.'
      )
    ).toBe(false)
  })

  it('measures source text bytes from normalized segments', () => {
    expect(
      measureSourceTextBytesFromSegments(['Alpha   beta', 'Gamma'])
    ).toBe(Buffer.byteLength('Alpha beta\n\nGamma', 'utf8'))
  })

  it('extracts meaningful text from nested payloads', () => {
    const snapshot = buildSourceTextSnapshotFromPayloads([
      {
        title: 'Reliability Report',
        blocks: [
          { text: 'A rendered browser session captured the hidden payload.' },
          { text: 'A rendered browser session captured the hidden payload.' },
        ],
        ignoredUrl: 'https://example.com',
      },
    ])

    expect(snapshot).toContain('Reliability Report')
    expect(snapshot).toContain(
      'A rendered browser session captured the hidden payload.'
    )
    expect(snapshot).not.toContain('https://example.com')
  })

  it('detects blocker-wall language in weak shells', () => {
    expect(
      detectSourceBlockerSignals([
        'Please log in to continue',
        'Open in app',
        'Enable JavaScript to continue',
      ])
    ).toEqual(
      expect.arrayContaining([
        'login-wall',
        'app-interstitial',
        'javascript-shell',
      ])
    )
  })

  it('measures payload-derived source text bytes', () => {
    expect(
      measureSourceTextBytesFromPayloads([
        {
          description:
            'This payload contains enough text to count as meaningful source content.',
        },
      ])
    ).toBe(
      Buffer.byteLength(
        'This payload contains enough text to count as meaningful source content.',
        'utf8'
      )
    )
  })
})
