import sharp from 'sharp'

const TILE_SIZE = 300
const COMPOSITE_SIZE = 600
const JPEG_QUALITY = 85

/**
 * Compose multiple images into a grid:
 * 1 image  -> pass through at 600x600
 * 2 images -> 1x2 horizontal strip
 * 3 images -> 2x2 grid with 4th slot as Instagram gradient
 * 4+ images -> 2x2 grid from first 4
 */
export async function createCompositeImage(
  imageBuffers: Buffer[]
): Promise<Buffer> {
  if (imageBuffers.length === 0) {
    throw new Error('No images to composite')
  }

  if (imageBuffers.length === 1) {
    return sharp(imageBuffers[0])
      .resize(COMPOSITE_SIZE, COMPOSITE_SIZE, { fit: 'cover' })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  }

  const tiles = await Promise.all(
    imageBuffers.slice(0, 4).map((buf) =>
      sharp(buf)
        .resize(TILE_SIZE, TILE_SIZE, { fit: 'cover' })
        .toBuffer()
    )
  )

  if (imageBuffers.length === 2) {
    return sharp({
      create: {
        width: COMPOSITE_SIZE,
        height: TILE_SIZE,
        channels: 3,
        background: { r: 245, g: 245, b: 245 },
      },
    })
      .composite([
        { input: tiles[0], left: 0, top: 0 },
        { input: tiles[1], left: TILE_SIZE, top: 0 },
      ])
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  }

  const gradientTile =
    tiles.length < 4
      ? await sharp({
          create: {
            width: TILE_SIZE,
            height: TILE_SIZE,
            channels: 3,
            background: { r: 131, g: 58, b: 180 },
          },
        }).toBuffer()
      : tiles[3]

  return sharp({
    create: {
      width: COMPOSITE_SIZE,
      height: COMPOSITE_SIZE,
      channels: 3,
      background: { r: 245, g: 245, b: 245 },
    },
  })
    .composite([
      { input: tiles[0], left: 0, top: 0 },
      { input: tiles[1], left: TILE_SIZE, top: 0 },
      { input: tiles[2], left: 0, top: TILE_SIZE },
      { input: gradientTile, left: TILE_SIZE, top: TILE_SIZE },
    ])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()
}

export async function fetchImageBuffers(
  urls: string[],
  maxImages = 4
): Promise<Buffer[]> {
  const results = await Promise.allSettled(
    urls.slice(0, maxImages).map(async (url) => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BYOA/1.0)' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.startsWith('image/'))
        throw new Error(`Not image: ${contentType}`)
      return Buffer.from(await res.arrayBuffer())
    })
  )

  return results
    .filter(
      (r): r is PromiseFulfilledResult<Buffer> => r.status === 'fulfilled'
    )
    .map((r) => r.value)
}
