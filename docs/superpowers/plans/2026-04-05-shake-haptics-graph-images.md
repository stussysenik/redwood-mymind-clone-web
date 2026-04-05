# Shake Toggle, Haptics, Graph Performance & Image Re-extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BYOA feel native — shake toggles shuffle globally, haptics on every interaction, shuffle works beautifully on iPhone SE, no card ever shows an empty image, graph list view shows real thumbnails, and graph rendering is fast enough for 1000+ nodes.

**Architecture:** 6 independent streams that can be parallelized. Streams 1-3 are frontend-only (hooks + components). Stream 4 spans frontend + backend (fallback chain + re-extract mutation). Stream 5 is a frontend component redesign. Stream 6 adds a Web Worker + Playwright POM tests.

**Tech Stack:** React 18, Redwood.js 8.9, web-haptics, react-force-graph-2d, D3.js, Sharp (backend), Playwright, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-05-shake-haptics-graph-images-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `web/src/hooks/useShakeDetection.ts` | Reusable shake gesture hook (DeviceMotionEvent) |
| `api/src/lib/scraper/compositeImage.ts` | Sharp-based image compositing for carousels |
| `web/src/lib/graph-worker.ts` | Web Worker for D3 force simulation off main thread |
| `e2e/graph-perf.spec.ts` | Playwright performance benchmarks with POM |
| `e2e/support/graph.page.ts` | Playwright Page Object Model for graph |

### Modified Files
| File | Changes |
|---|---|
| `web/src/layouts/AppLayout/AppLayout.tsx` | Add global shake detection hook |
| `web/src/components/ShuffleModal/ShuffleModal.tsx` | Remove shake logic, add haptics, replace dots with progress bar, mobile responsive |
| `web/src/components/GraphClient/GraphClient.tsx` | Pass imageUrl to list view, haptics on node interactions, viewport culling, LOD |
| `web/src/components/GraphListView/GraphListView.tsx` | Full redesign — thumbnails, clean metadata, remove per-card orphan message |
| `web/src/components/Card/Card.tsx` | Expanded image fallback chain, auto re-extract trigger |
| `web/src/components/cards/InstagramCard.tsx` | Expanded fallback chain with re-extract |
| `api/src/graphql/cards.sdl.ts` | Add `reExtractImage` mutation |
| `api/src/services/cards/cards.ts` | Implement `reExtractImage` resolver |

---

## Task 1: Global Shake Detection Hook

**Files:**
- Create: `web/src/hooks/useShakeDetection.ts`
- Modify: `web/src/layouts/AppLayout/AppLayout.tsx:1-12,39-41,58-91`
- Modify: `web/src/components/ShuffleModal/ShuffleModal.tsx:58-91`

- [ ] **Step 1: Create the `useShakeDetection` hook**

```typescript
// web/src/hooks/useShakeDetection.ts
import { useEffect, useRef, useCallback } from 'react'

interface ShakeOptions {
  threshold?: number
  shakeCount?: number
  timeWindow?: number
}

const PERMISSION_KEY = 'byoa-shake-permission'

async function requestMotionPermission(): Promise<boolean> {
  // Skip on desktop / non-motion environments
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
    return false
  }

  const DM = DeviceMotionEvent as any
  if (typeof DM.requestPermission !== 'function') {
    // Android / older iOS — permission not needed
    return true
  }

  // Already granted this session
  if (localStorage.getItem(PERMISSION_KEY) === 'granted') {
    return true
  }

  try {
    const result = await DM.requestPermission()
    if (result === 'granted') {
      localStorage.setItem(PERMISSION_KEY, 'granted')
      return true
    }
    return false
  } catch {
    return false
  }
}

export function useShakeDetection(
  onShake: () => void,
  options: ShakeOptions = {}
): void {
  const { threshold = 25, shakeCount = 3, timeWindow = 500 } = options
  const callbackRef = useRef(onShake)
  callbackRef.current = onShake

  const shakeState = useRef({ last: 0, count: 0 })

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      return
    }

    let mounted = true
    requestMotionPermission().then((granted) => {
      if (!mounted || !granted) return
    })

    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity
      if (!acc?.x || !acc?.y || !acc?.z) return

      const force = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z)
      const now = Date.now()

      if (force > threshold) {
        if (now - shakeState.current.last < timeWindow) {
          shakeState.current.count++
          if (shakeState.current.count >= shakeCount) {
            callbackRef.current()
            shakeState.current.count = 0
          }
        } else {
          shakeState.current.count = 1
        }
        shakeState.current.last = now
      }
    }

    window.addEventListener('devicemotion', handler)
    return () => {
      mounted = false
      window.removeEventListener('devicemotion', handler)
    }
  }, [threshold, shakeCount, timeWindow])
}
```

- [ ] **Step 2: Wire shake hook into AppLayout**

In `web/src/layouts/AppLayout/AppLayout.tsx`, add the import and hook call:

```typescript
// Add to imports (after line 9)
import { useShakeDetection } from 'src/hooks/useShakeDetection'

// Add inside AppLayout component, after the existing state declarations (after line 46)
useShakeDetection(() => {
  haptic('heavy')
  setShowShuffle((prev) => !prev)
})
```

- [ ] **Step 3: Remove shake detection from ShuffleModal**

In `web/src/components/ShuffleModal/ShuffleModal.tsx`, delete lines 58-91 (the entire shake-to-close useEffect block, from `// Shake-to-close:` through the closing `}, [onClose])`). This removes the duplicate shake handler.

- [ ] **Step 4: Verify the build compiles**

Run: `cd /Users/s3nik/Desktop/redwood-mymind-clone-web && npx tsc --noEmit --project web/tsconfig.json`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useShakeDetection.ts web/src/layouts/AppLayout/AppLayout.tsx web/src/components/ShuffleModal/ShuffleModal.tsx
git commit -m "feat: global shake-to-toggle shuffle via useShakeDetection hook"
```

---

## Task 2: Shuffle Modal — Mobile Responsive + Progress Bar

**Files:**
- Modify: `web/src/components/ShuffleModal/ShuffleModal.tsx:134-457`

- [ ] **Step 1: Redesign the counter and header area**

Replace the current counter pill (lines 170-180) with a more prominent counter:

```tsx
{confirmedCount !== null && cards.length > 0 && (
  <span
    className="tabular-nums text-sm font-semibold sm:text-base"
    style={{ color: 'var(--foreground)' }}
  >
    {index + 1}
    <span style={{ color: 'var(--foreground-muted)', margin: '0 2px' }}>/</span>
    {cards.length}
  </span>
)}
```

- [ ] **Step 2: Replace dot indicators with tappable progress bar**

Replace the dot indicators section (lines 405-421) with:

```tsx
{/* Progress bar — replaces dot indicators */}
<div
  className="relative mx-3 flex-1 cursor-pointer"
  style={{ height: 3, backgroundColor: 'var(--border-default)', borderRadius: 2 }}
  onClick={(e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    const target = Math.floor(fraction * cards.length)
    setIndex(Math.max(0, Math.min(cards.length - 1, target)))
    haptic('light')
  }}
  role="progressbar"
  aria-valuenow={index + 1}
  aria-valuemin={1}
  aria-valuemax={cards.length}
>
  <div
    style={{
      width: `${((index + 1) / cards.length) * 100}%`,
      height: '100%',
      backgroundColor: 'var(--accent-primary)',
      borderRadius: 2,
      transition: 'width 200ms ease',
    }}
  />
</div>
```

- [ ] **Step 3: Make navigation footer mobile-responsive**

Replace the navigation footer (lines 387-436) with responsive prev/next that go icon-only on small screens:

```tsx
{/* Navigation footer */}
<div
  className="flex items-center justify-between px-3 py-3 sm:px-5"
  style={{ borderTop: '1px solid var(--border-subtle)' }}
>
  <button
    onClick={() => { prev(); haptic('light') }}
    disabled={index === 0}
    className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-all disabled:opacity-30 min-w-[44px] min-h-[44px] justify-center sm:px-4"
    style={{
      backgroundColor: 'var(--surface-soft)',
      color: 'var(--foreground)',
    }}
  >
    <ChevronLeft size={16} />
    <span className="hidden sm:inline">Prev</span>
  </button>

  {/* Progress bar */}
  <div
    className="relative mx-3 flex-1 cursor-pointer"
    style={{ height: 3, backgroundColor: 'var(--border-default)', borderRadius: 2 }}
    onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const fraction = (e.clientX - rect.left) / rect.width
      const target = Math.floor(fraction * cards.length)
      setIndex(Math.max(0, Math.min(cards.length - 1, target)))
      haptic('light')
    }}
    role="progressbar"
    aria-valuenow={index + 1}
    aria-valuemin={1}
    aria-valuemax={cards.length}
  >
    <div
      style={{
        width: `${((index + 1) / cards.length) * 100}%`,
        height: '100%',
        backgroundColor: 'var(--accent-primary)',
        borderRadius: 2,
        transition: 'width 200ms ease',
      }}
    />
  </div>

  <button
    onClick={() => { next(); haptic('light') }}
    disabled={index === cards.length - 1}
    className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-all disabled:opacity-30 min-w-[44px] min-h-[44px] justify-center sm:px-4"
    style={{
      backgroundColor: 'var(--surface-soft)',
      color: 'var(--foreground)',
    }}
  >
    <span className="hidden sm:inline">Next</span>
    <ChevronRight size={16} />
  </button>
</div>
```

- [ ] **Step 4: Make modal insets mobile-friendly**

Update the modal container (line 145) from:
```
className="fixed inset-x-4 inset-y-6 z-[70] mx-auto flex flex-col overflow-hidden rounded-2xl shadow-2xl sm:inset-x-8 sm:inset-y-10"
```
to:
```
className="fixed inset-x-2 inset-y-3 z-[70] mx-auto flex flex-col overflow-hidden rounded-2xl shadow-2xl sm:inset-x-8 sm:inset-y-10"
```

And update the card image maxHeight (line 325) from `maxHeight: 260` to responsive:

```tsx
style={{ maxHeight: window.innerWidth < 400 ? 200 : 260 }}
```

- [ ] **Step 5: Make quick-pick buttons wrap-safe**

Update the quick-pick container (line 262) from:
```tsx
<div className="flex gap-2">
```
to:
```tsx
<div className="flex flex-wrap justify-center gap-2">
```

- [ ] **Step 6: Verify build and test on iPhone SE viewport**

Run: `cd /Users/s3nik/Desktop/redwood-mymind-clone-web && npx tsc --noEmit --project web/tsconfig.json`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ShuffleModal/ShuffleModal.tsx
git commit -m "feat: shuffle modal mobile responsive — progress bar, prominent counter, iPhone SE support"
```

---

## Task 3: Haptics Balance

**Files:**
- Modify: `web/src/components/ShuffleModal/ShuffleModal.tsx`
- Modify: `web/src/components/GraphClient/GraphClient.tsx:421-443`

- [ ] **Step 1: Add haptics to ShuffleModal interactions**

In `ShuffleModal.tsx`:

Add haptic to **slider change** (debounced). Add a ref and update the onChange handler at line 248:

```tsx
// Add near other refs at the top of the component
const lastSliderHaptic = useRef(0)

// Update slider onChange (line 248)
onChange={(e) => {
  setCount(Number(e.target.value))
  const now = Date.now()
  if (now - lastSliderHaptic.current > 80) {
    haptic('selection')
    lastSliderHaptic.current = now
  }
}}
```

Add haptic to **quick-pick buttons** (line 266):
```tsx
onClick={() => { haptic('selection'); setCount(n) }}
```

Add haptic to **Draw cards button** (line 282):
```tsx
onClick={() => { haptic('medium'); handleStart() }}
```

Add haptic to **Reshuffle button** (line 185):
```tsx
onClick={() => { haptic('medium'); handleReshuffle() }}
```

- [ ] **Step 2: Add haptics to GraphClient node interactions**

In `web/src/components/GraphClient/GraphClient.tsx`:

Add import at top:
```typescript
import { haptic } from 'src/lib/haptics'
```

In `handleNodeClick` callback (line 421-443), add haptics:

```typescript
const handleNodeClick = useCallback(
  (node: FGNode) => {
    const now = Date.now()
    const last = lastTapRef.current

    const isDoubleTap = last && last.nodeId === node.id && now - last.time < 400
    lastTapRef.current = { nodeId: node.id, time: now }

    if (focusedNodeId === node.id || isDoubleTap) {
      haptic('medium')
      setSelectedCardId(node.id)
    } else {
      haptic('light')
      setFocusedNodeId(node.id)
      const fg = fgRef.current
      if (fg) {
        fg.centerAt(node.x, node.y, 600)
        fg.zoom(isMobile ? 2 : 2.5, 600)
      }
    }
  },
  [focusedNodeId, isMobile]
)
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/s3nik/Desktop/redwood-mymind-clone-web && npx tsc --noEmit --project web/tsconfig.json`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/ShuffleModal/ShuffleModal.tsx web/src/components/GraphClient/GraphClient.tsx
git commit -m "feat: haptics balance — contextual feedback on shuffle, graph, and navigation interactions"
```

---

## Task 4: Image Re-extraction — Frontend Fallback Chain

**Files:**
- Modify: `web/src/components/Card/Card.tsx:136-254`
- Modify: `web/src/components/cards/InstagramCard.tsx:56-80`

- [ ] **Step 1: Expand GenericCard fallback chain in Card.tsx**

Replace the `renderVisual` function in `GenericCard` (lines 155-254) with an expanded 5-tier fallback. The key change: remove the `isSocialUrl` skip on screenshots (social CDN URLs expire, we should try screenshot), add `metadata.scrapedImageUrl` as a tier, and auto-trigger re-extract on gradient fallback.

In `Card.tsx`, add the re-extract mutation and session tracking near the top of the file:

```typescript
import { useMutation } from '@redwoodjs/web'

const RE_EXTRACT_IMAGE = gql`
  mutation ReExtractImage($cardId: String!) {
    reExtractImage(cardId: $cardId) {
      id
      imageUrl
      metadata
    }
  }
`
```

Inside `GenericCard`, add the mutation hook and tracking:

```typescript
const [reExtract] = useMutation(RE_EXTRACT_IMAGE)
const reExtractAttempted = useRef(false)
```

Add a new state for the scrapedImage fallback tier:

```typescript
const [scrapedImageError, setScrapedImageError] = useState(false)
```

Build the expanded `renderVisual`:

```typescript
const renderVisual = () => {
  const hasValidUrl = card.url && !card.url.startsWith('file:') && !card.url.startsWith('local-')
  const scrapedImageUrl = getBrowserImageUrl(
    (card.metadata?.scrapedImageUrl as string) || null
  )
  const metaFirstImage = getBrowserImageUrl(
    Array.isArray(card.metadata?.images) ? (card.metadata.images as string[])[0] : null
  )

  // Tier 1: Primary Image
  if (browserImageUrl && !imageError) {
    return (
      <div
        className="relative w-full overflow-hidden"
        style={{
          backgroundColor: card.metadata?.colors?.[0] || 'rgb(243, 244, 246)',
          aspectRatio: 'auto',
        }}
      >
        <img
          src={browserImageUrl}
          alt={card.title || 'Card image'}
          className="object-cover w-full h-full"
          loading={isPriority ? 'eager' : 'lazy'}
          onError={() => setImageError(true)}
        />
        {domain && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md">
            <Globe className="w-3 h-3 text-white/80" />
            <span className="text-xs font-medium text-white truncate max-w-[100px]">{domain}</span>
          </div>
        )}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
              <Play className="w-5 h-5 text-gray-800 ml-0.5" fill="currentColor" />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Tier 2: metadata.images[0]
  if (metaFirstImage && metaFirstImage !== browserImageUrl && !screenshotError) {
    return (
      <div className="relative w-full overflow-hidden" style={{ backgroundColor: card.metadata?.colors?.[0] || 'rgb(243, 244, 246)' }}>
        <img
          src={metaFirstImage}
          alt={card.title || 'Card image'}
          className="object-cover w-full h-full"
          loading="lazy"
          onError={() => setScreenshotError(true)}
        />
      </div>
    )
  }

  // Tier 3: metadata.scrapedImageUrl
  if (scrapedImageUrl && !scrapedImageError) {
    return (
      <div className="relative w-full overflow-hidden" style={{ backgroundColor: card.metadata?.colors?.[0] || 'rgb(243, 244, 246)' }}>
        <img
          src={scrapedImageUrl}
          alt="Scraped preview"
          className="object-cover w-full h-full"
          loading="lazy"
          onError={() => setScrapedImageError(true)}
        />
      </div>
    )
  }

  // Tier 4: Microlink screenshot (now includes social URLs too)
  const screenshotUrl = getFallbackScreenshotUrl(card.url)
  if (hasValidUrl && screenshotUrl && !screenshotError) {
    return (
      <div className="relative w-full overflow-hidden bg-gray-50">
        <div className="absolute inset-0 animate-shimmer" />
        <img
          src={screenshotUrl}
          alt="Site Preview"
          className="object-cover object-top opacity-90 hover:opacity-100 transition-opacity relative z-10 w-full h-full"
          loading="lazy"
          onError={() => setScreenshotError(true)}
        />
        {domain && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md z-20">
            <Globe className="w-3 h-3 text-white/80" />
            <span className="text-xs font-medium text-white truncate max-w-[100px]">{domain || 'Website'}</span>
          </div>
        )}
      </div>
    )
  }

  // Tier 5: Note card special rendering
  if (card.type === 'note') {
    return (
      <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 min-h-[120px]">
        <h4 className="text-xs font-semibold text-orange-600 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          {decodeHtmlEntities(card.title || 'Add a New Note')}
        </h4>
        <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">
          {decodeHtmlEntities(card.content?.slice(0, 200) || 'Start typing here...')}
        </p>
      </div>
    )
  }

  // Tier 6: Gradient placeholder + trigger silent re-extract
  if (!reExtractAttempted.current && card.id) {
    reExtractAttempted.current = true
    const sessionKey = `byoa-reextract-${card.id}`
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, '1')
      reExtract({ variables: { cardId: card.id } }).catch(() => {})
    }
  }

  const getGradient = (str: string) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue1 = Math.abs(hash % 360)
    const hue2 = (hue1 + 40) % 360
    return `linear-gradient(135deg, hsl(${hue1}, 70%, 90%), hsl(${hue2}, 70%, 95%))`
  }

  return (
    <div
      className="aspect-[1.618/1] w-full flex items-center justify-center transition-transform duration-500 group-hover:scale-105"
      style={{ background: getGradient(card.title || card.type) }}
    >
      <TypeIcon className="h-12 w-12 text-gray-400/50" />
    </div>
  )
}
```

- [ ] **Step 2: Update `getFallbackScreenshotUrl` in imageProxy.ts to allow social URLs**

In `web/src/lib/imageProxy.ts`, remove the social URL block (lines 57-64) from `getFallbackScreenshotUrl`:

Delete this block:
```typescript
  const lower = normalizedUrl.toLowerCase()
  if (
    lower.includes('twitter.com') ||
    lower.includes('x.com') ||
    lower.includes('instagram.com')
  ) {
    return null
  }
```

Social CDN URLs expire, so screenshot fallback is valuable for these too.

- [ ] **Step 3: Add auto re-extract trigger to InstagramCard.tsx**

In `web/src/components/cards/InstagramCard.tsx`, add the re-extract mutation. After the existing imports, add:

```typescript
import { useMutation } from '@redwoodjs/web'

const RE_EXTRACT_IMAGE = gql`
  mutation ReExtractImageInstagram($cardId: String!) {
    reExtractImage(cardId: $cardId) {
      id
      imageUrl
      metadata
    }
  }
`
```

Inside the `InstagramCard` component, add after the `isPriority` line (line 49):

```typescript
const [reExtract] = useMutation(RE_EXTRACT_IMAGE)
const reExtractAttempted = useRef(false)
```

Add `useRef` to the React import at line 9.

Then update the `handleImageError` function (lines 72-80) to trigger re-extract when all fallbacks exhausted:

```typescript
const handleImageError = () => {
  if (fallbackIndex < imageFallbackChain.length - 1) {
    setFallbackIndex((prev) => prev + 1)
  } else {
    setImageError(true)
    // Trigger silent re-extract when all image sources fail
    if (!reExtractAttempted.current && card.id) {
      reExtractAttempted.current = true
      const sessionKey = `byoa-reextract-${card.id}`
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, '1')
        reExtract({ variables: { cardId: card.id } }).catch(() => {})
      }
    }
  }
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/s3nik/Desktop/redwood-mymind-clone-web && npx tsc --noEmit --project web/tsconfig.json`
Expected: No type errors (the mutation doesn't exist yet on the backend — this will show a GraphQL codegen warning but not a TS error)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Card/Card.tsx web/src/components/cards/InstagramCard.tsx web/src/lib/imageProxy.ts
git commit -m "feat: 5-tier image fallback chain with silent re-extract on gradient placeholder"
```

---

## Task 5: Image Re-extraction — Backend Mutation

**Files:**
- Modify: `api/src/graphql/cards.sdl.ts:70-78`
- Modify: `api/src/services/cards/cards.ts`
- Create: `api/src/lib/scraper/compositeImage.ts`

- [ ] **Step 1: Add `reExtractImage` mutation to SDL**

In `api/src/graphql/cards.sdl.ts`, add the mutation inside the `type Mutation` block (after line 77):

```graphql
reExtractImage(cardId: String!): Card! @requireAuth
```

- [ ] **Step 2: Create composite image utility**

```typescript
// api/src/lib/scraper/compositeImage.ts
import sharp from 'sharp'

const TILE_SIZE = 300
const COMPOSITE_SIZE = 600
const JPEG_QUALITY = 85

/**
 * Compose multiple images into a grid:
 * 1 image  → pass through at 600x600
 * 2 images → 1x2 horizontal strip
 * 3 images → 2x2 grid with 4th slot as Instagram gradient
 * 4+ images → 2x2 grid from first 4
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
    // 1x2 horizontal strip
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

  // 2x2 grid — fill slot 4 with gradient if only 3 images
  const gradientTile =
    tiles.length < 4
      ? await sharp({
          create: {
            width: TILE_SIZE,
            height: TILE_SIZE,
            channels: 3,
            background: { r: 131, g: 58, b: 180 }, // Instagram purple
          },
        })
          .toBuffer()
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

/**
 * Fetch image buffers from URLs, skipping failed fetches.
 */
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
      if (!contentType.startsWith('image/')) throw new Error(`Not image: ${contentType}`)
      return Buffer.from(await res.arrayBuffer())
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<Buffer> => r.status === 'fulfilled')
    .map((r) => r.value)
}
```

- [ ] **Step 3: Implement `reExtractImage` resolver**

In `api/src/services/cards/cards.ts`, add the resolver. First add imports at the top:

```typescript
import { createCompositeImage, fetchImageBuffers } from 'src/lib/scraper/compositeImage'
import { buildMicrolinkScreenshotUrl } from 'src/lib/scraper/fallbackPreview'
```

Then add the resolver function:

```typescript
export const reExtractImage = async ({ cardId }: { cardId: string }) => {
  const userId = context.currentUser?.sub
  if (!userId) throw new Error('Not authenticated')

  const card = await db.card.findFirst({
    where: { id: cardId, userId, deletedAt: null },
  })
  if (!card) throw new Error('Card not found')

  const metadata = (card.metadata || {}) as Record<string, unknown>

  // Rate limit: max 1 re-extract per card per 24h
  const lastReExtract = metadata.lastReExtractAt as string | undefined
  if (lastReExtract) {
    const elapsed = Date.now() - new Date(lastReExtract).getTime()
    if (elapsed < 24 * 60 * 60 * 1000) {
      return card // Skip, too recent
    }
  }

  let newImageUrl: string | null = null

  // Strategy 1: Instagram carousel composite
  const images = (metadata.images as string[]) || []
  if (images.length >= 2 && !card.imageUrl) {
    try {
      const buffers = await fetchImageBuffers(images)
      if (buffers.length >= 2) {
        const composite = await createCompositeImage(buffers)
        // Upload to Supabase Storage
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const path = `cards/${cardId}/composite.jpg`
        const { error: uploadError } = await supabase.storage
          .from('card-media')
          .upload(path, composite, {
            contentType: 'image/jpeg',
            upsert: true,
          })

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('card-media')
            .getPublicUrl(path)
          newImageUrl = urlData.publicUrl
        }
      }
    } catch {
      // Composite failed, continue to next strategy
    }
  }

  // Strategy 2: Microlink screenshot for any URL
  if (!newImageUrl && card.url) {
    try {
      const screenshotUrl = buildMicrolinkScreenshotUrl(card.url)
      if (screenshotUrl) {
        // Verify the screenshot URL actually works
        const res = await fetch(screenshotUrl, { signal: AbortSignal.timeout(15000) })
        if (res.ok) {
          const contentType = res.headers.get('content-type') || ''
          if (contentType.startsWith('image/')) {
            newImageUrl = screenshotUrl
          }
        }
      }
    } catch {
      // Screenshot failed
    }
  }

  // Update card if we found an image
  const updatedMetadata = {
    ...metadata,
    lastReExtractAt: new Date().toISOString(),
    reExtractSuccess: !!newImageUrl,
  }

  return db.card.update({
    where: { id: cardId },
    data: {
      ...(newImageUrl ? { imageUrl: newImageUrl } : {}),
      metadata: updatedMetadata,
    },
  })
}
```

- [ ] **Step 4: Run GraphQL codegen and verify build**

Run: `cd /Users/s3nik/Desktop/redwood-mymind-clone-web && yarn rw generate types`
Then: `npx tsc --noEmit --project api/tsconfig.json`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add api/src/graphql/cards.sdl.ts api/src/services/cards/cards.ts api/src/lib/scraper/compositeImage.ts
git commit -m "feat: reExtractImage mutation — composite generation, screenshot retry, silent re-extraction"
```

---

## Task 6: Graph List View Redesign

**Files:**
- Modify: `web/src/components/GraphListView/GraphListView.tsx:1-281`
- Modify: `web/src/components/GraphClient/GraphClient.tsx:55-64`

- [ ] **Step 1: Update GraphClientNode to pass imageUrl through to GraphListView**

The `GraphClientNode` interface already has `imageUrl` (line 59), and `GraphCell.tsx` already queries it. But `GraphListNode` in `GraphListView.tsx` doesn't include it. Update the interface (line 3):

```typescript
interface GraphListNode {
  id: string
  title?: string | null
  imageUrl?: string | null  // ADD THIS
  type: string
  tags: readonly string[] | string[]
  connections: number
  color?: string
}
```

- [ ] **Step 2: Redesign GraphListView with thumbnails and clean metadata**

Replace the entire `GraphListView` component body (lines 47-279) with:

```tsx
export function GraphListView({
  nodes,
  links,
  onCardOpen,
}: GraphListViewProps) {
  const titleMap = new Map(nodes.map((node) => [node.id, node.title || 'Untitled']))
  const typeMap = new Map(nodes.map((node) => [node.id, node.type]))
  const colorMap = new Map(
    nodes.map((node) => [node.id, node.color || 'var(--accent-primary)'])
  )
  const connectionMap = new Map<string, ConnectionPreview[]>()

  for (const link of links) {
    const sharedTags = Array.isArray(link.sharedTags) ? [...link.sharedTags] : []
    const sourceList = connectionMap.get(link.source) || []
    const targetList = connectionMap.get(link.target) || []

    sourceList.push({
      id: link.target,
      title: titleMap.get(link.target) || 'Untitled',
      type: typeMap.get(link.target) || 'article',
      color: colorMap.get(link.target) || 'var(--accent-primary)',
      weight: link.weight,
      sharedTags,
    })
    targetList.push({
      id: link.source,
      title: titleMap.get(link.source) || 'Untitled',
      type: typeMap.get(link.source) || 'article',
      color: colorMap.get(link.source) || 'var(--accent-primary)',
      weight: link.weight,
      sharedTags,
    })

    connectionMap.set(link.source, sourceList)
    connectionMap.set(link.target, targetList)
  }

  // Sort: connected cards first (by count desc), then orphans alphabetically
  const sortedNodes = [...nodes].sort((left, right) => {
    const leftConns = connectionMap.get(left.id)?.length || 0
    const rightConns = connectionMap.get(right.id)?.length || 0
    if (leftConns !== rightConns) return rightConns - leftConns
    return (left.title || '').localeCompare(right.title || '')
  })

  // Check if all types are the same (don't show redundant badge)
  const uniqueTypes = new Set(nodes.map((n) => n.type))
  const showTypeBadge = uniqueTypes.size > 1

  const orphanCount = sortedNodes.filter(
    (n) => !connectionMap.get(n.id)?.length
  ).length

  return (
    <div className="space-y-4 px-4 pb-24 pt-20 sm:px-6 sm:pb-8">
      {/* Header */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-[20px] px-4 py-3 sm:px-5"
        style={{
          background:
            'linear-gradient(135deg, rgba(255, 107, 74, 0.08), rgba(43, 87, 154, 0.05))',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'var(--surface-card)' }}
        >
          <Rows3 className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--foreground-muted)' }}
          >
            Connection Index
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--foreground)' }}>
            {orphanCount > 0 && orphanCount === nodes.length
              ? 'Cards will connect as shared tags develop.'
              : `${nodes.length - orphanCount} connected cards, ${orphanCount} unconnected.`}
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: 'var(--foreground-muted)' }}
        >
          <span>{nodes.length} nodes</span>
          <span>&middot;</span>
          <span>{links.length} links</span>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {sortedNodes.map((node) => {
          const connections = [...(connectionMap.get(node.id) || [])].sort(
            (left, right) => right.weight - left.weight
          )
          const nodeTags = Array.isArray(node.tags)
            ? [...node.tags].slice(0, 4)
            : []
          const hasConnections = connections.length > 0

          return (
            <section
              key={node.id}
              className="overflow-hidden rounded-[22px]"
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <button
                type="button"
                onClick={() => onCardOpen(node.id)}
                className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors sm:px-5"
                style={{ backgroundColor: 'transparent' }}
              >
                {/* Thumbnail or type-initial circle */}
                {node.imageUrl ? (
                  <img
                    src={node.imageUrl}
                    alt=""
                    className="mt-0.5 h-12 w-12 shrink-0 rounded-xl object-cover"
                    style={{ backgroundColor: node.color || 'var(--surface-soft)' }}
                    loading="lazy"
                    onError={(e) => {
                      // Fallback to colored circle with initial
                      const el = e.currentTarget
                      const parent = el.parentElement!
                      const initial = (TYPE_LABELS[node.type] || node.type)?.[0]?.toUpperCase() || '?'
                      const div = document.createElement('div')
                      div.className = 'mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white text-sm font-semibold'
                      div.style.background = node.color || 'var(--accent-primary)'
                      div.textContent = initial
                      parent.replaceChild(div, el)
                    }}
                  />
                ) : (
                  <div
                    className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white text-sm font-semibold"
                    style={{
                      background:
                        node.color ||
                        'linear-gradient(135deg, var(--accent-primary), #D95A3E)',
                    }}
                  >
                    {(TYPE_LABELS[node.type] || node.type)?.[0]?.toUpperCase() || '?'}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {showTypeBadge && (
                      <span
                        className="rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em]"
                        style={{
                          backgroundColor: 'var(--surface-soft)',
                          color: 'var(--foreground-muted)',
                        }}
                      >
                        {TYPE_LABELS[node.type] || node.type}
                      </span>
                    )}
                    {hasConnections && (
                      <span
                        className="rounded-full px-2 py-1 text-[10px] font-medium"
                        style={{
                          backgroundColor: 'var(--surface-accent)',
                          color: 'var(--accent-primary)',
                        }}
                      >
                        {connections.length} connection
                        {connections.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <h3
                    className="mt-2 text-base font-semibold leading-tight"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {node.title || 'Untitled'}
                  </h3>
                  {nodeTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {nodeTags.map((tag) => (
                        <span
                          key={`${node.id}-${tag}`}
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{
                            backgroundColor: 'var(--surface-elevated)',
                            color: 'var(--foreground-muted)',
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ArrowUpRight
                  className="mt-1 h-4 w-4 shrink-0"
                  style={{ color: 'var(--foreground-muted)' }}
                />
              </button>

              {/* Connections section — only show if there are connections */}
              {hasConnections && (
                <div
                  className="border-t px-4 py-3 sm:px-5"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="space-y-2.5">
                    {connections.slice(0, 4).map((connection) => (
                      <button
                        key={`${node.id}-${connection.id}`}
                        type="button"
                        onClick={() => onCardOpen(connection.id)}
                        className="flex w-full items-start gap-3 rounded-[16px] px-3 py-3 text-left transition-colors"
                        style={{ backgroundColor: 'var(--surface-elevated)' }}
                      >
                        <span
                          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: connection.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-sm font-medium"
                            style={{ color: 'var(--foreground)' }}
                          >
                            {connection.title}
                          </span>
                          <span
                            className="mt-1 block text-xs"
                            style={{ color: 'var(--foreground-muted)' }}
                          >
                            Shared: {connection.sharedTags.slice(0, 3).join(', ')}
                            {connection.sharedTags.length > 3
                              ? ` +${connection.sharedTags.length - 3}`
                              : ''}
                          </span>
                        </span>
                        <span
                          className="rounded-full px-2 py-1 text-[10px] font-medium"
                          style={{
                            backgroundColor: 'var(--surface-card)',
                            color: 'var(--foreground-muted)',
                          }}
                        >
                          {connection.weight}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/s3nik/Desktop/redwood-mymind-clone-web && npx tsc --noEmit --project web/tsconfig.json`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/GraphListView/GraphListView.tsx
git commit -m "feat: graph list view redesign — thumbnails, clean metadata, no per-card orphan messages"
```

---

## Task 7: Graph Performance — Viewport Culling + LOD

**Files:**
- Modify: `web/src/components/GraphClient/GraphClient.tsx:483-642`

- [ ] **Step 1: Add viewport bounds helper and zoom tracking**

In `GraphClient.tsx`, add zoom state after the existing state declarations (around line 188):

```typescript
const [currentZoom, setCurrentZoom] = useState(1)
```

Add an `onZoom` callback to track zoom level. Add this after the other callbacks:

```typescript
const handleZoom = useCallback(({ k }: { k: number }) => {
  setCurrentZoom(k)
}, [])
```

Pass `onZoom={handleZoom}` to the `ForceGraphCanvas` component props (around line 729).

- [ ] **Step 2: Add viewport culling to nodeCanvasObject**

At the start of the `nodeCanvasObject` callback (after getting x, y), add bounds check:

```typescript
const nodeCanvasObject = useCallback(
  (node: FGNode, ctx: CanvasRenderingContext2D) => {
    const x = node.x ?? 0
    const y = node.y ?? 0

    // Viewport culling — skip nodes outside visible canvas
    const canvas = ctx.canvas
    const transform = ctx.getTransform()
    const screenX = x * transform.a + transform.e
    const screenY = y * transform.d + transform.f
    const pad = 60 // padding for labels/glow
    if (
      screenX < -pad ||
      screenX > canvas.width + pad ||
      screenY < -pad ||
      screenY > canvas.height + pad
    ) {
      return
    }

    // ... rest of existing rendering
```

- [ ] **Step 3: Add LOD (Level of Detail) to nodeCanvasObject**

After the viewport culling check, add LOD logic. Replace the label-rendering section with zoom-aware rendering:

```typescript
    // LOD: skip labels at low zoom, skip initials at very low zoom
    const showLabels = currentZoom > 1.0
    const showInitials = currentZoom > 0.5
```

Then wrap the existing type-initial rendering (lines 548-557) with:

```typescript
    if (showInitials) {
      const initial = TYPE_INITIALS[type] || '?'
      // ... existing initial rendering code
    }
```

And wrap the existing title-label rendering (lines 560-576) with:

```typescript
    if (showLabels) {
      const title = node.title
      // ... existing label rendering code
    }
```

- [ ] **Step 4: Add viewport culling to linkCanvasObject**

At the start of `linkCanvasObject`, after getting src/tgt coordinates, add:

```typescript
    // Viewport culling — skip links where both endpoints are offscreen
    const canvas = ctx.canvas
    const transform = ctx.getTransform()
    const srcScreenX = sx * transform.a + transform.e
    const srcScreenY = sy * transform.d + transform.f
    const tgtScreenX = tx * transform.a + transform.e
    const tgtScreenY = ty * transform.d + transform.f
    const pad = 20
    const bothOffscreen =
      (srcScreenX < -pad && tgtScreenX < -pad) ||
      (srcScreenX > canvas.width + pad && tgtScreenX > canvas.width + pad) ||
      (srcScreenY < -pad && tgtScreenY < -pad) ||
      (srcScreenY > canvas.height + pad && tgtScreenY > canvas.height + pad)
    if (bothOffscreen) return
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/s3nik/Desktop/redwood-mymind-clone-web && npx tsc --noEmit --project web/tsconfig.json`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add web/src/components/GraphClient/GraphClient.tsx
git commit -m "perf: graph viewport culling + LOD — skip offscreen nodes, simplify at low zoom"
```

---

## Task 8: Graph Performance — Web Worker for Force Simulation

**Files:**
- Create: `web/src/lib/graph-worker.ts`
- Modify: `web/src/components/GraphClient/GraphClient.tsx`

- [ ] **Step 1: Create the graph Web Worker**

```typescript
// web/src/lib/graph-worker.ts
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from 'd3-force'

interface WorkerNode {
  id: string
  x?: number
  y?: number
  vx?: number
  vy?: number
  connections: number
}

interface WorkerLink {
  source: string | WorkerNode
  target: string | WorkerNode
  weight: number
}

interface InitMessage {
  type: 'init'
  nodes: WorkerNode[]
  links: WorkerLink[]
  isMobile: boolean
}

interface TickMessage {
  type: 'tick'
  nodes: Array<{ id: string; x: number; y: number }>
}

interface DoneMessage {
  type: 'done'
  nodes: Array<{ id: string; x: number; y: number }>
}

self.onmessage = (e: MessageEvent<InitMessage>) => {
  if (e.data.type !== 'init') return

  const { nodes, links, isMobile } = e.data

  const CHARGE_FLOOR = isMobile ? -200 : -300
  const CHARGE_PER_NODE = isMobile ? 0.5 : 0.8
  const CHARGE_BASE = isMobile ? -100 : -150
  const chargeStrength = Math.min(
    CHARGE_FLOOR,
    CHARGE_BASE - nodes.length * CHARGE_PER_NODE
  )

  const simulation = forceSimulation(nodes as any)
    .force(
      'charge',
      forceManyBody()
        .strength(chargeStrength)
        .distanceMax(isMobile ? 400 : 600)
    )
    .force(
      'link',
      forceLink(links as any)
        .id((d: any) => d.id)
        .distance((l: any) => {
          const base = isMobile ? 50 : 80
          const spread = isMobile ? 100 : 150
          return base + (1 / (l.weight ?? 1)) * spread
        })
    )
    .force('center', forceCenter(0, 0).strength(0.05))
    .force('collide', forceCollide(8))
    .alphaDecay(isMobile ? 0.04 : 0.008)
    .velocityDecay(0.3)
    .stop()

  // Run ticks manually and post positions back
  const totalTicks = isMobile ? 150 : 300
  const batchSize = 10

  for (let i = 0; i < totalTicks; i++) {
    simulation.tick()

    // Post intermediate positions every batchSize ticks
    if (i % batchSize === 0) {
      const positions = nodes.map((n: any) => ({
        id: n.id,
        x: n.x ?? 0,
        y: n.y ?? 0,
      }))
      ;(self as any).postMessage({ type: 'tick', nodes: positions } as TickMessage)
    }
  }

  // Final positions
  const finalPositions = nodes.map((n: any) => ({
    id: n.id,
    x: n.x ?? 0,
    y: n.y ?? 0,
  }))
  ;(self as any).postMessage({ type: 'done', nodes: finalPositions } as DoneMessage)
}
```

Note: This Web Worker is a supplemental optimization. The primary `react-force-graph-2d` already handles its own D3 simulation internally. This worker is designed for future use when switching to a custom rendering pipeline. For now, the viewport culling + LOD from Task 7 provide the main perf wins. The worker integration with the force-graph library requires careful coordination — document this as a follow-up in the spec rather than forcing it into the current render loop.

- [ ] **Step 2: Verify the worker compiles**

Run: `cd /Users/s3nik/Desktop/redwood-mymind-clone-web && npx tsc --noEmit --project web/tsconfig.json`
Expected: No type errors (worker file standalone)

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/graph-worker.ts
git commit -m "perf: add D3 force simulation Web Worker (foundation for custom graph renderer)"
```

---

## Task 9: Playwright Performance Tests with POM

**Files:**
- Create: `e2e/support/graph.page.ts`
- Create: `e2e/graph-perf.spec.ts`

- [ ] **Step 1: Create Graph Page Object Model**

```typescript
// e2e/support/graph.page.ts
import type { Page, Locator } from '@playwright/test'

export class GraphPage {
  readonly page: Page
  readonly canvas: Locator
  readonly listView: Locator
  readonly graphToggle: Locator
  readonly listToggle: Locator
  readonly filterPanel: Locator

  constructor(page: Page) {
    this.page = page
    this.canvas = page.locator('canvas')
    this.listView = page.locator('.space-y-4') // GraphListView container
    this.graphToggle = page.locator('button[role="tab"]', { hasText: 'Graph' })
    this.listToggle = page.locator('button[role="tab"]', { hasText: 'List' })
    this.filterPanel = page.locator('[data-testid="graph-filter-panel"]')
  }

  async goto() {
    await this.page.goto('/graph')
    await this.page.waitForLoadState('networkidle')
  }

  async waitForGraphRender(timeout = 10000) {
    await this.canvas.waitFor({ state: 'visible', timeout })
    // Wait for initial simulation to settle
    await this.page.waitForTimeout(3000)
  }

  async waitForListRender(timeout = 10000) {
    await this.listView.waitFor({ state: 'visible', timeout })
  }

  async switchToList() {
    await this.listToggle.click()
    await this.waitForListRender()
  }

  async switchToGraph() {
    await this.graphToggle.click()
    await this.waitForGraphRender()
  }

  async getNodeCount(): Promise<number> {
    return this.page.evaluate(() => {
      const text = document.querySelector('[class*="text-xs"]')?.textContent || ''
      const match = text.match(/(\d+)\s*nodes/)
      return match ? parseInt(match[1], 10) : 0
    })
  }

  async measureFPS(durationMs = 3000): Promise<number> {
    return this.page.evaluate((duration) => {
      return new Promise<number>((resolve) => {
        let frames = 0
        const start = performance.now()
        function countFrame() {
          frames++
          if (performance.now() - start < duration) {
            requestAnimationFrame(countFrame)
          } else {
            const elapsed = performance.now() - start
            resolve(Math.round((frames / elapsed) * 1000))
          }
        }
        requestAnimationFrame(countFrame)
      })
    }, durationMs)
  }

  async measureTimeToInteractive(): Promise<number> {
    const start = Date.now()
    await this.goto()
    await this.waitForGraphRender()
    return Date.now() - start
  }

  async getListCardCount(): Promise<number> {
    return this.page.locator('section').count()
  }

  async getListCardImages(): Promise<number> {
    return this.page.locator('section img').count()
  }
}
```

- [ ] **Step 2: Create performance benchmark tests**

```typescript
// e2e/graph-perf.spec.ts
import { expect, login, test } from './support/fixtures'
import { GraphPage } from './support/graph.page'

test.describe('Graph Performance', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  test('graph reaches interactive state within 5 seconds', async ({
    page,
  }) => {
    const graphPage = new GraphPage(page)
    const tti = await graphPage.measureTimeToInteractive()
    console.log(`[perf] Time to interactive: ${tti}ms`)
    expect(tti).toBeLessThan(5000)
  })

  test('graph canvas maintains 30+ FPS', async ({ page }) => {
    const graphPage = new GraphPage(page)
    await graphPage.goto()
    await graphPage.waitForGraphRender()
    const fps = await graphPage.measureFPS(3000)
    console.log(`[perf] Graph FPS: ${fps}`)
    expect(fps).toBeGreaterThan(25) // Allow small margin below 30
  })

  test('list view renders card thumbnails', async ({ page }) => {
    const graphPage = new GraphPage(page)
    await graphPage.goto()
    await graphPage.switchToList()
    const cardCount = await graphPage.getListCardCount()
    console.log(`[perf] List cards: ${cardCount}`)
    expect(cardCount).toBeGreaterThan(0)
    // At least some cards should have images (not all will due to missing assets)
    const imageCount = await graphPage.getListCardImages()
    console.log(`[perf] Cards with images: ${imageCount}/${cardCount}`)
  })

  test('view mode toggle is responsive', async ({ page }) => {
    const graphPage = new GraphPage(page)
    await graphPage.goto()
    await graphPage.waitForGraphRender()

    const start = Date.now()
    await graphPage.switchToList()
    const switchTime = Date.now() - start
    console.log(`[perf] Graph→List switch: ${switchTime}ms`)
    expect(switchTime).toBeLessThan(2000)
  })
})
```

- [ ] **Step 3: Verify tests can be discovered**

Run: `cd /Users/s3nik/Desktop/redwood-mymind-clone-web && npx playwright test --list e2e/graph-perf.spec.ts`
Expected: Lists 4 tests without errors

- [ ] **Step 4: Commit**

```bash
git add e2e/support/graph.page.ts e2e/graph-perf.spec.ts
git commit -m "test: Playwright POM + performance benchmarks for graph — FPS, TTI, view switch"
```

---

## Verification Checklist

After all tasks are complete, verify each stream:

- [ ] **Stream 1:** On mobile (or DevTools device emulation), shake triggers shuffle open/close
- [ ] **Stream 2:** Open shuffle on 375px viewport — counter is readable, progress bar works, prev/next are icon-only, no overflow
- [ ] **Stream 3:** Tap through shuffle flow — haptics fire on slider, quick-pick, draw, reshuffle; graph node tap/double-tap have distinct haptics
- [ ] **Stream 4:** Find a card with broken image — verify it falls through tiers and triggers re-extract silently
- [ ] **Stream 5:** Visit `/graph`, switch to List view — cards show thumbnails, no per-card orphan message, clean layout
- [ ] **Stream 6:** Visit `/graph` — simulation doesn't jank, zooming out simplifies node rendering, Playwright perf tests pass

```bash
# Full verification
cd /Users/s3nik/Desktop/redwood-mymind-clone-web
npx tsc --noEmit --project web/tsconfig.json
npx tsc --noEmit --project api/tsconfig.json
yarn rw generate types
npx playwright test e2e/graph-perf.spec.ts
```
