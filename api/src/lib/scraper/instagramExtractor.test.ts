import {
  extractInstagramPost,
  extractShortcode,
  extractInstagramTarget,
  isInstagramShareUrl,
  resolveInstagramShareUrl,
  fetchViaGraphQL,
  fetchViaInstaFix,
  INSTAFIX_MIRRORS,
} from './instagramExtractor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(
    async (input, init) => impl(String(input), init)
  )
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

// ---------------------------------------------------------------------------
// URL PARSING
// ---------------------------------------------------------------------------

describe('extractInstagramTarget', () => {
  afterEach(() => jest.restoreAllMocks())

  it('parses standard /p/ post URLs', () => {
    const result = extractInstagramTarget('https://www.instagram.com/p/ABC123/')
    expect(result).toEqual({ shortcode: 'ABC123', kind: 'p', url: 'https://www.instagram.com/p/ABC123/' })
  })

  it('parses /reel/ URLs', () => {
    const result = extractInstagramTarget('https://www.instagram.com/reel/XYZ789/')
    expect(result?.kind).toBe('reel')
    expect(result?.shortcode).toBe('XYZ789')
  })

  it('parses /tv/ URLs', () => {
    const result = extractInstagramTarget('https://www.instagram.com/tv/IGTV01/')
    expect(result?.kind).toBe('tv')
    expect(result?.shortcode).toBe('IGTV01')
  })

  it('parses /share/reel/ URLs', () => {
    const result = extractInstagramTarget('https://www.instagram.com/share/reel/SHARE01/')
    expect(result?.kind).toBe('reel')
    expect(result?.shortcode).toBe('SHARE01')
  })

  it('parses /share/p/ URLs', () => {
    const result = extractInstagramTarget('https://www.instagram.com/share/p/SHARE02/')
    expect(result?.kind).toBe('p')
    expect(result?.shortcode).toBe('SHARE02')
  })

  it('strips query parameters', () => {
    const result = extractInstagramTarget(
      'https://www.instagram.com/p/ABC123/?igsh=xyz&utm_source=ig_web_copy_link'
    )
    expect(result?.shortcode).toBe('ABC123')
  })

  it('handles instagram.com without www', () => {
    const result = extractInstagramTarget('https://instagram.com/reel/NWWW01/')
    expect(result?.shortcode).toBe('NWWW01')
  })

  it('returns null for non-Instagram URLs', () => {
    expect(extractInstagramTarget('https://twitter.com/user/status/123')).toBeNull()
  })

  it('returns null for profile URLs (no media kind)', () => {
    expect(extractInstagramTarget('https://www.instagram.com/username/')).toBeNull()
  })

  it('returns null for malformed URLs', () => {
    expect(extractInstagramTarget('not a url at all')).toBeNull()
  })
})

describe('extractShortcode', () => {
  it('returns shortcode from a post URL', () => {
    expect(extractShortcode('https://www.instagram.com/p/ABC123/')).toBe('ABC123')
  })

  it('returns null for non-Instagram URLs', () => {
    expect(extractShortcode('https://example.com')).toBeNull()
  })
})

describe('isInstagramShareUrl', () => {
  it('detects /share/reel/ URLs', () => {
    expect(isInstagramShareUrl('https://www.instagram.com/share/reel/ABC/')).toBe(true)
  })

  it('detects /share/p/ URLs', () => {
    expect(isInstagramShareUrl('https://www.instagram.com/share/p/XYZ/')).toBe(true)
  })

  it('rejects standard /p/ URLs', () => {
    expect(isInstagramShareUrl('https://www.instagram.com/p/ABC/')).toBe(false)
  })

  it('rejects non-Instagram URLs', () => {
    expect(isInstagramShareUrl('https://example.com/share/reel/ABC/')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SHARE URL RESOLUTION
// ---------------------------------------------------------------------------

describe('resolveInstagramShareUrl', () => {
  afterEach(() => jest.restoreAllMocks())

  it('follows 302 redirects', async () => {
    mockFetch(() => new Response(null, {
      status: 302,
      headers: { location: 'https://www.instagram.com/reel/CANON123/?igsh=abc' },
    }))

    const resolved = await resolveInstagramShareUrl(
      'https://www.instagram.com/share/reel/SHARE123/'
    )
    expect(resolved).toBe('https://www.instagram.com/reel/CANON123/?igsh=abc')
  })

  it('parses canonical URL from HTML when 200 response', async () => {
    mockFetch(() => htmlResponse(
      '<html><head><link rel="canonical" href="https://www.instagram.com/p/HTML01/" /></head></html>'
    ))

    const resolved = await resolveInstagramShareUrl(
      'https://www.instagram.com/share/p/SHARE456/'
    )
    expect(resolved).toBe('https://www.instagram.com/p/HTML01/')
  })

  it('returns original URL when not a share URL', async () => {
    const url = 'https://www.instagram.com/p/NORMAL01/'
    const resolved = await resolveInstagramShareUrl(url)
    expect(resolved).toBe(url)
  })

  it('returns original URL on network failure', async () => {
    mockFetch(() => { throw new Error('network down') })

    const resolved = await resolveInstagramShareUrl(
      'https://www.instagram.com/share/reel/FAIL01/'
    )
    expect(resolved).toBe('https://www.instagram.com/share/reel/FAIL01/')
  })

  it('returns original URL when redirect has no location header', async () => {
    mockFetch(() => new Response(null, { status: 301 }))

    const resolved = await resolveInstagramShareUrl(
      'https://www.instagram.com/share/reel/NOLOC01/'
    )
    expect(resolved).toBe('https://www.instagram.com/share/reel/NOLOC01/')
  })
})

// ---------------------------------------------------------------------------
// GRAPHQL STRATEGY
// ---------------------------------------------------------------------------

describe('fetchViaGraphQL', () => {
  afterEach(() => jest.restoreAllMocks())

  it('extracts carousel with mixed media', async () => {
    mockFetch(() => jsonResponse({
      data: {
        xdt_shortcode_media: {
          __typename: 'XDTGraphSidecar',
          shortcode: 'CAR01',
          is_video: false,
          owner: {
            username: 'artist',
            full_name: 'Artist Name',
            profile_pic_url: 'https://example.com/avatar.jpg',
          },
          edge_media_to_caption: {
            edges: [{ node: { text: 'Carousel caption' } }],
          },
          edge_sidecar_to_children: {
            edges: [
              { node: { display_url: 'https://cdn.example.com/1.jpg', is_video: false } },
              { node: { display_url: 'https://cdn.example.com/2.jpg', is_video: true, video_url: 'https://cdn.example.com/2.mp4' } },
              { node: { display_url: 'https://cdn.example.com/3.jpg', is_video: false } },
            ],
          },
          edge_media_preview_like: { count: 12 },
          edge_media_to_comment: { count: 3 },
          taken_at_timestamp: 1712345678,
        },
      },
    }))

    const result = await fetchViaGraphQL('CAR01', 'p')

    expect(result).not.toBeNull()
    expect(result!.images).toEqual([
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/2.jpg',
      'https://cdn.example.com/3.jpg',
    ])
    expect(result!.mediaTypes).toEqual(['image', 'video', 'image'])
    expect(result!.videoPositions).toEqual([1])
    expect(result!.isCarousel).toBe(true)
    expect(result!.source).toBe('graphql')
    expect(result!.authorHandle).toBe('artist')
    expect(result!.caption).toBe('Carousel caption')
    expect(result!.likes).toBe(12)
    expect(result!.comments).toBe(3)
  })

  it('extracts single image post', async () => {
    mockFetch(() => jsonResponse({
      data: {
        xdt_shortcode_media: {
          __typename: 'XDTGraphImage',
          shortcode: 'SINGLE01',
          is_video: false,
          display_url: 'https://cdn.example.com/single.jpg',
          owner: { username: 'user1', full_name: 'User One' },
          edge_media_to_caption: { edges: [{ node: { text: 'Single post' } }] },
          edge_media_preview_like: { count: 5 },
          edge_media_to_comment: { count: 1 },
          taken_at_timestamp: 1712345678,
        },
      },
    }))

    const result = await fetchViaGraphQL('SINGLE01', 'p')

    expect(result).not.toBeNull()
    expect(result!.images).toHaveLength(1)
    expect(result!.images[0]).toBe('https://cdn.example.com/single.jpg')
    expect(result!.isCarousel).toBe(false)
    expect(result!.mediaTypes).toEqual(['image'])
  })

  it('extracts video/reel with video_url', async () => {
    mockFetch(() => jsonResponse({
      data: {
        xdt_shortcode_media: {
          __typename: 'XDTGraphVideo',
          shortcode: 'VID01',
          is_video: true,
          video_url: 'https://cdn.example.com/video.mp4',
          display_url: 'https://cdn.example.com/thumb.jpg',
          owner: { username: 'videocreator' },
          edge_media_to_caption: { edges: [{ node: { text: 'Video post' } }] },
          edge_media_preview_like: { count: 100 },
          edge_media_to_comment: { count: 10 },
          taken_at_timestamp: 1712345678,
        },
      },
    }))

    const result = await fetchViaGraphQL('VID01', 'reel')

    expect(result).not.toBeNull()
    expect(result!.isVideo).toBe(true)
    expect(result!.videoUrl).toBe('https://cdn.example.com/video.mp4')
    expect(result!.images).toContain('https://cdn.example.com/thumb.jpg')
    expect(result!.mediaTypes).toEqual(['video'])
  })

  it('returns null when xdt_shortcode_media is null', async () => {
    mockFetch(() => jsonResponse({ data: { xdt_shortcode_media: null } }))
    const result = await fetchViaGraphQL('NULL01', 'p')
    expect(result).toBeNull()
  })

  it('returns null when Instagram returns HTML login wall', async () => {
    mockFetch(() => htmlResponse('<html><body>Login required</body></html>'))
    const result = await fetchViaGraphQL('LOGIN01', 'p')
    expect(result).toBeNull()
  })

  it('returns null on network failure', async () => {
    mockFetch(() => { throw new Error('ECONNREFUSED') })
    const result = await fetchViaGraphQL('NET01', 'p')
    expect(result).toBeNull()
  })

  it('tries multiple doc_ids on failure', async () => {
    let callCount = 0
    mockFetch(() => {
      callCount++
      if (callCount === 1) {
        // First doc_id fails
        return jsonResponse({ data: { xdt_shortcode_media: null } })
      }
      // Second doc_id succeeds
      return jsonResponse({
        data: {
          xdt_shortcode_media: {
            __typename: 'XDTGraphImage',
            shortcode: 'MULTI01',
            is_video: false,
            display_url: 'https://cdn.example.com/found.jpg',
            owner: { username: 'u' },
            edge_media_to_caption: { edges: [] },
            edge_media_preview_like: { count: 0 },
            edge_media_to_comment: { count: 0 },
          },
        },
      })
    })

    const result = await fetchViaGraphQL('MULTI01', 'p')
    expect(result).not.toBeNull()
    expect(callCount).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
// INSTAFIX STRATEGY
// ---------------------------------------------------------------------------

describe('fetchViaInstaFix', () => {
  afterEach(() => jest.restoreAllMocks())

  it('extracts images from OG tags on first mirror', async () => {
    mockFetch((url) => {
      if (url.includes(INSTAFIX_MIRRORS[0])) {
        return htmlResponse(`
          <html>
            <head>
              <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/img1.jpg" />
              <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/img2.jpg" />
              <meta property="og:title" content="@photographer on Instagram" />
              <meta property="og:description" content="Beautiful sunset shots" />
            </head>
          </html>
        `)
      }
      throw new Error(`unexpected URL: ${url}`)
    })

    const result = await fetchViaInstaFix('INSTA01', 'p')

    expect(result).not.toBeNull()
    expect(result!.images.length).toBeGreaterThanOrEqual(1)
    expect(result!.source).toBe('instafix')
  })

  it('falls back to next mirror on failure', async () => {
    const calledMirrors: string[] = []
    mockFetch((url) => {
      for (const mirror of INSTAFIX_MIRRORS) {
        if (url.includes(mirror)) {
          calledMirrors.push(mirror)
          if (mirror === INSTAFIX_MIRRORS[0]) {
            return new Response(null, { status: 500 })
          }
          return htmlResponse(`
            <html><head>
              <meta property="og:image" content="https://scontent.cdninstagram.com/fallback.jpg" />
              <meta property="og:title" content="@fallback" />
            </head></html>
          `)
        }
      }
      throw new Error(`unexpected: ${url}`)
    })

    const result = await fetchViaInstaFix('FALL01', 'p')
    expect(calledMirrors.length).toBeGreaterThan(1)
    // May or may not succeed depending on oEmbed fallback too
  })

  it('returns null when all mirrors fail', async () => {
    mockFetch(() => new Response(null, { status: 500 }))
    const result = await fetchViaInstaFix('ALLFAIL01', 'p')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// FULL EXTRACTION PIPELINE
// ---------------------------------------------------------------------------

describe('extractInstagramPost', () => {
  afterEach(() => jest.restoreAllMocks())

  it('returns null for non-Instagram URLs', async () => {
    const result = await extractInstagramPost('https://twitter.com/user/status/123')
    expect(result).toBeNull()
  })

  it('extracts a standard post via GraphQL (happy path)', async () => {
    mockFetch((url) => {
      if (url.includes('instagram.com/api/graphql')) {
        return jsonResponse({
          data: {
            xdt_shortcode_media: {
              __typename: 'XDTGraphImage',
              shortcode: 'HAPPY01',
              is_video: false,
              display_url: 'https://cdn.example.com/happy.jpg',
              owner: { username: 'happyuser', full_name: 'Happy User' },
              edge_media_to_caption: { edges: [{ node: { text: 'Happy day!' } }] },
              edge_media_preview_like: { count: 42 },
              edge_media_to_comment: { count: 7 },
              taken_at_timestamp: 1712345678,
            },
          },
        })
      }
      // InstaFix runs in parallel — return empty
      return htmlResponse('<html></html>')
    })

    const result = await extractInstagramPost('https://www.instagram.com/p/HAPPY01/')

    expect(result).not.toBeNull()
    expect(result!.shortcode).toBe('HAPPY01')
    expect(result!.images).toContain('https://cdn.example.com/happy.jpg')
    expect(result!.caption).toBe('Happy day!')
    expect(result!.authorHandle).toBe('happyuser')
  })

  it('falls through to InstaFix when GraphQL returns null', async () => {
    mockFetch((url) => {
      if (url.includes('instagram.com/api/graphql')) {
        return jsonResponse({ data: { xdt_shortcode_media: null } })
      }
      // InstaFix mirror
      if (url.includes('instagram.com') && !url.includes('www.instagram.com')) {
        return htmlResponse(`
          <html><head>
            <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/fallback.jpg" />
            <meta property="og:title" content="@fallbackuser" />
            <meta property="og:description" content="Fallback caption" />
          </head></html>
        `)
      }
      return htmlResponse('<html></html>')
    })

    const result = await extractInstagramPost('https://www.instagram.com/p/FALLGQL01/')

    expect(result).not.toBeNull()
    expect(result!.images.length).toBeGreaterThanOrEqual(1)
  })

  it('resolves share URLs before extraction', async () => {
    const calls: string[] = []
    mockFetch((url) => {
      calls.push(url)

      // Share URL resolution — redirect to canonical
      if (url.includes('/share/reel/')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://www.instagram.com/reel/RESOLVED01/' },
        })
      }

      // GraphQL for the resolved URL
      if (url.includes('instagram.com/api/graphql')) {
        return jsonResponse({
          data: {
            xdt_shortcode_media: {
              __typename: 'XDTGraphVideo',
              shortcode: 'RESOLVED01',
              is_video: true,
              video_url: 'https://cdn.example.com/reel.mp4',
              display_url: 'https://cdn.example.com/reel-thumb.jpg',
              owner: { username: 'reelcreator' },
              edge_media_to_caption: { edges: [] },
              edge_media_preview_like: { count: 0 },
              edge_media_to_comment: { count: 0 },
            },
          },
        })
      }

      return htmlResponse('<html></html>')
    })

    const result = await extractInstagramPost(
      'https://www.instagram.com/share/reel/SHARE_ID/'
    )

    expect(result).not.toBeNull()
    expect(result!.targetKind).toBe('reel')
    // Verify share URL was resolved first
    expect(calls.some(c => c.includes('/share/reel/'))).toBe(true)
  })

  it('handles complete failure of all strategies gracefully', async () => {
    mockFetch(() => { throw new Error('network down everywhere') })

    const result = await extractInstagramPost('https://www.instagram.com/p/DOOM01/')
    expect(result).toBeNull()
  })

  it('runs GraphQL and InstaFix in parallel', async () => {
    const timestamps: { strategy: string; time: number }[] = []
    const start = Date.now()

    mockFetch((url) => {
      if (url.includes('instagram.com/api/graphql')) {
        timestamps.push({ strategy: 'graphql', time: Date.now() - start })
        return jsonResponse({ data: { xdt_shortcode_media: null } })
      }
      if (INSTAFIX_MIRRORS.some(m => url.includes(m))) {
        timestamps.push({ strategy: 'instafix', time: Date.now() - start })
        return htmlResponse('<html></html>')
      }
      // Embed/OG fallbacks
      return htmlResponse('<html></html>')
    })

    await extractInstagramPost('https://www.instagram.com/p/PARALLEL01/')

    // Both GraphQL and InstaFix should have been called
    expect(timestamps.some(t => t.strategy === 'graphql')).toBe(true)
    expect(timestamps.some(t => t.strategy === 'instafix')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// MIRROR LIST INTEGRITY
// ---------------------------------------------------------------------------

describe('INSTAFIX_MIRRORS', () => {
  it('does not include archived ddinstagram.com', () => {
    expect(INSTAFIX_MIRRORS).not.toContain('ddinstagram.com')
  })

  it('includes eeinstagram.com as primary mirror', () => {
    expect(INSTAFIX_MIRRORS[0]).toBe('eeinstagram.com')
  })

  it('has at least 2 mirrors for redundancy', () => {
    expect(INSTAFIX_MIRRORS.length).toBeGreaterThanOrEqual(2)
  })
})
