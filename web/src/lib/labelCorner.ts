/**
 * Picks the best corner of an image for overlaying a small text label.
 *
 * Samples a small patch at each of the four corners, scores them by
 * luminance standard deviation (lower = flatter = more legible), and
 * returns both the chosen corner and whether that area is dark or light
 * so the label can pick white-on-dark or black-on-light text.
 *
 * Requires the image server to send CORS headers. If sampling fails
 * (tainted canvas, network error, SSR), returns a safe fallback so
 * callers can keep working.
 */

export type LabelCorner = 'tl' | 'tr' | 'bl' | 'br'
/** Describes the BACKDROP the label sits on, not the text color. */
export type LabelTone = 'light' | 'dark'

export interface LabelPlacement {
  corner: LabelCorner
  tone: LabelTone
}

const FALLBACK: LabelPlacement = { corner: 'bl', tone: 'dark' }

const cache = new Map<string, LabelPlacement>()
const pending = new Map<string, Promise<LabelPlacement>>()

export function getCachedLabelPlacement(src: string): LabelPlacement | null {
  return cache.get(src) ?? null
}

export function pickLabelPlacement(src: string): Promise<LabelPlacement> {
  if (typeof window === 'undefined') return Promise.resolve(FALLBACK)
  const cached = cache.get(src)
  if (cached) return Promise.resolve(cached)
  const inflight = pending.get(src)
  if (inflight) return inflight

  const work = compute(src).then((result) => {
    cache.set(src, result)
    pending.delete(src)
    return result
  })
  pending.set(src, work)
  return work
}

function compute(src: string): Promise<LabelPlacement> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let settled = false
    const done = (result: LabelPlacement) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    img.onload = () => {
      try {
        const aspect = img.naturalHeight / Math.max(1, img.naturalWidth)
        const W = 200
        const H = Math.max(80, Math.round(W * aspect))
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return done(FALLBACK)
        // Fill with white first so transparent PNGs composite over the
        // same background the card shows them against, rather than
        // reading as pure black alpha=0 pixels.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, W, H)
        ctx.drawImage(img, 0, 0, W, H)

        const boxW = 60
        const boxH = 22
        const pad = 6
        const regions: Array<[LabelCorner, number, number]> = [
          ['tl', pad, pad],
          ['tr', W - pad - boxW, pad],
          ['bl', pad, H - pad - boxH],
          ['br', W - pad - boxW, H - pad - boxH],
        ]

        let best: LabelCorner = 'bl'
        let bestScore = Infinity
        let bestMean = 128
        for (const [key, x, y] of regions) {
          const data = ctx.getImageData(x, y, boxW, boxH).data
          const n = data.length / 4
          let sum = 0
          let sumSq = 0
          for (let i = 0; i < data.length; i += 4) {
            const luma =
              0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
            sum += luma
            sumSq += luma * luma
          }
          const mean = sum / n
          const variance = Math.max(0, sumSq / n - mean * mean)
          // Slight bottom bias so all-else-equal we prefer bottom corners,
          // which feel more like a caption than a floating watermark.
          const bias = key.startsWith('b') ? 0.82 : 1
          const score = Math.sqrt(variance) * bias
          if (score < bestScore) {
            bestScore = score
            best = key
            bestMean = mean
          }
        }

        // Mean luminance 0-255. Threshold at 155 biases slightly toward
        // "the backdrop is dark" — dark text on light imagery reads well,
        // but white text on medium-dark imagery starts to struggle, so we
        // err on the side of treating middle grays as dark (→ white text).
        const tone: LabelTone = bestMean > 155 ? 'light' : 'dark'
        done({ corner: best, tone })
      } catch {
        done(FALLBACK)
      }
    }
    img.onerror = () => done(FALLBACK)
    img.src = src
  })
}
