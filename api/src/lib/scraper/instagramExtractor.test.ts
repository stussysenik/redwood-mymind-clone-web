import {
  extractInstagramPost,
  fetchViaGraphQL,
  resolveInstagramShareUrl,
} from './instagramExtractor'

describe('instagramExtractor', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('extracts mixed carousel media metadata from GraphQL', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            xdt_shortcode_media: {
              __typename: 'XDTGraphSidecar',
              shortcode: 'ABC123',
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
                  {
                    node: {
                      display_url: 'https://cdn.example.com/1.jpg',
                      is_video: false,
                    },
                  },
                  {
                    node: {
                      display_url: 'https://cdn.example.com/2.jpg',
                      is_video: true,
                      video_url: 'https://cdn.example.com/2.mp4',
                    },
                  },
                  {
                    node: {
                      display_url: 'https://cdn.example.com/3.jpg',
                      is_video: false,
                    },
                  },
                ],
              },
              edge_media_preview_like: { count: 12 },
              edge_media_to_comment: { count: 3 },
              taken_at_timestamp: 1712345678,
            },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const result = await fetchViaGraphQL('ABC123', 'p')

    expect(result).not.toBeNull()
    expect(result?.images).toEqual([
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/2.jpg',
      'https://cdn.example.com/3.jpg',
    ])
    expect(result?.mediaTypes).toEqual(['image', 'video', 'image'])
    expect(result?.videoPositions).toEqual([1])
    expect(result?.isCarousel).toBe(true)
    expect(result?.targetKind).toBe('p')
  })

  it('uses reel endpoints for reel fallback extraction', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input)

        if (url === 'https://www.instagram.com/api/graphql') {
          return new Response(
            JSON.stringify({
              data: { xdt_shortcode_media: null },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        }

        if (url.includes('instagram.com/reel/REEL123/embed/captioned/')) {
          return new Response(
            '<html><body><img src="https://scontent.cdninstagram.com/v/t51.2885-15/preview.jpg" /></body></html>',
            {
              status: 200,
              headers: { 'content-type': 'text/html; charset=utf-8' },
            }
          )
        }

        if (url.includes('instagram.com/reel/REEL123/')) {
          return new Response('<html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        }

        throw new Error(`network down for ${url}`)
      })

    const result = await extractInstagramPost(
      'https://www.instagram.com/reel/REEL123/?utm_source=ig_web_copy_link'
    )

    expect(result).not.toBeNull()
    expect(result?.targetKind).toBe('reel')
    expect(result?.images).toEqual([
      'https://scontent.cdninstagram.com/v/t51.2885-15/preview.jpg',
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.instagram.com/reel/REEL123/embed/captioned/',
      expect.any(Object)
    )
  })

  it('resolves share URLs from HTTP redirects', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://www.instagram.com/reel/CANON123/?igsh=abc',
        },
      })
    )

    const resolved = await resolveInstagramShareUrl(
      'https://www.instagram.com/share/reel/SHARE123/'
    )

    expect(resolved).toBe('https://www.instagram.com/reel/CANON123/?igsh=abc')
  })
})
