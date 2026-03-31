import { useEffect, useMemo, useState } from 'react'

import {
  BookOpen,
  Film,
  FileText,
  Globe,
  Image as ImageIcon,
  Play,
  ShoppingBag,
  StickyNote,
  Users,
  Volume2,
  type LucideIcon,
} from 'lucide-react'

import { AnalyzingIndicator } from 'src/components/AnalyzingIndicator'
import { getTagColor } from 'src/components/TagDisplay/TagDisplay'
import {
  formatRemainingTime,
  getEnrichmentProgress,
  getProcessingState,
} from 'src/lib/enrichment-timing'
import { ENRICHMENT_PROGRESS_STAGES, toProgressEnrichmentStage } from 'src/lib/semantic'
import type { Card, CardMetadata, CardType } from 'src/lib/types'

export interface FeedCardRecord {
  id: string
  userId?: string | null
  type: string
  title?: string | null
  content?: string | null
  url?: string | null
  imageUrl?: string | null
  metadata?: Partial<CardMetadata> | null
  tags?: string[] | null
  createdAt: string
  updatedAt?: string
  archivedAt?: string | null
  deletedAt?: string | null
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  article: FileText,
  image: ImageIcon,
  note: StickyNote,
  product: ShoppingBag,
  book: BookOpen,
  video: Play,
  audio: Volume2,
  social: Users,
  movie: Film,
  website: Globe,
}

function normalizeCardType(type: string | null | undefined): CardType {
  const normalized = (type || 'website').toLowerCase()
  if (
    normalized === 'article' ||
    normalized === 'image' ||
    normalized === 'note' ||
    normalized === 'product' ||
    normalized === 'book' ||
    normalized === 'video' ||
    normalized === 'audio' ||
    normalized === 'social' ||
    normalized === 'movie' ||
    normalized === 'website'
  ) {
    return normalized
  }

  return 'website'
}

export function toFeedCard(card: FeedCardRecord): Card {
  return {
    id: card.id,
    userId: card.userId ?? '',
    type: normalizeCardType(card.type),
    title: card.title ?? null,
    content: card.content ?? null,
    url: card.url ?? null,
    imageUrl: card.imageUrl ?? null,
    metadata: (card.metadata ?? {}) as Card['metadata'],
    tags: card.tags ?? [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt ?? card.createdAt,
    deletedAt: card.deletedAt ?? null,
    archivedAt: card.archivedAt ?? null,
  }
}

function isNoteCard(card: FeedCardRecord): boolean {
  return normalizeCardType(card.type) === 'note'
}

function getFallbackScreenshotUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null

  const normalizedUrl = url.trim()
  if (!normalizedUrl) return null
  if (normalizedUrl.startsWith('file:') || normalizedUrl.startsWith('local-')) {
    return null
  }

  const lower = normalizedUrl.toLowerCase()
  if (
    lower.includes('twitter.com') ||
    lower.includes('x.com') ||
    lower.includes('instagram.com')
  ) {
    return null
  }

  return `https://api.microlink.io/?url=${encodeURIComponent(normalizedUrl)}&screenshot=true&meta=false&embed=screenshot.url`
}

function getVisualSources(
  card: FeedCardRecord
): Array<{ src: string; kind: 'image' | 'screenshot' }> {
  const sources: Array<{ src: string; kind: 'image' | 'screenshot' }> = []
  const seen = new Set<string>()
  const pushSource = (
    src: string | null | undefined,
    kind: 'image' | 'screenshot'
  ) => {
    if (!src) return
    const trimmed = src.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    sources.push({ src: trimmed, kind })
  }

  pushSource(card.imageUrl, 'image')

  const metaImages = Array.isArray(card.metadata?.images)
    ? card.metadata.images
    : []
  for (const image of metaImages) {
    pushSource(image, 'image')
  }

  if (!isNoteCard(card)) {
    pushSource(getFallbackScreenshotUrl(card.url), 'screenshot')
  }

  return sources
}

function renderGradient(card: FeedCardRecord) {
  const TypeIcon = TYPE_ICONS[normalizeCardType(card.type)] ?? Globe
  const seed = card.title || card.type || 'card'
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue1 = Math.abs(hash % 360)
  const hue2 = (hue1 + 38) % 360

  return (
    <div
      style={{
        minHeight: 140,
        borderRadius: '12px 12px 0 0',
        background: `linear-gradient(135deg, hsl(${hue1}, 72%, 92%) 0%, hsl(${hue2}, 72%, 96%) 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <TypeIcon className="h-10 w-10 text-black/25" />
    </div>
  )
}

function NoteCardVisual({
  title,
  content,
}: {
  title?: string | null
  content?: string | null
}) {
  return (
    <div
      style={{
        background:
          'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 50%, #FFCC80 100%)',
        borderRadius: '12px 12px 0 0',
        padding: '24px 16px',
        minHeight: 140,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <p
        className="text-center font-serif"
        style={{
          fontSize: 16,
          lineHeight: 1.5,
          color: '#5D4037',
          display: '-webkit-box',
          WebkitLineClamp: 6,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {content || title || 'Note'}
      </p>
    </div>
  )
}

export function FeedCardVisual({ card }: { card: FeedCardRecord }) {
  const [failedSources, setFailedSources] = useState<string[]>([])
  const isNote = isNoteCard(card)
  const processingState = getProcessingState(card.metadata)

  const sources = useMemo(() => getVisualSources(card), [card])

  useEffect(() => {
    setFailedSources([])
  }, [card.id])

  const activeSource = sources.find(({ src }) => !failedSources.includes(src))

  const visual = activeSource ? (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: '12px 12px 0 0',
        aspectRatio: '5 / 3',
        backgroundColor: 'var(--shimmer-base)',
      }}
    >
      <img
        src={activeSource.src}
        alt={card.title || 'Card visual'}
        loading="lazy"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'cover',
        }}
        onError={() => {
          setFailedSources((current) =>
            current.includes(activeSource.src)
              ? current
              : [...current, activeSource.src]
          )
        }}
      />
    </div>
  ) : isNote ? (
    <NoteCardVisual title={card.title} content={card.content} />
  ) : (
    renderGradient(card)
  )

  return (
    <div className="relative">
      {visual}
      {processingState !== 'idle' && processingState !== 'failed' && (
        <div className="absolute left-2 top-2 z-10">
          <AnalyzingIndicator
            variant="light"
            size="sm"
            showStage
            serverStage={card.metadata?.enrichmentStage}
          />
        </div>
      )}
    </div>
  )
}

function FeedCardStatus({ card }: { card: FeedCardRecord }) {
  const processingState = getProcessingState(card.metadata)

  if (processingState === 'idle' || processingState === 'failed') {
    return null
  }

  const progressStage = toProgressEnrichmentStage(card.metadata?.enrichmentStage)
  const stageLabel =
    ENRICHMENT_PROGRESS_STAGES.find((stage) => stage.name === progressStage)
      ?.label ?? 'Analyzing'

  const timing = card.metadata?.enrichmentTiming
  const elapsedMs = timing?.startedAt ? Math.max(0, Date.now() - timing.startedAt) : 0
  const estimatedTotalMs = timing?.estimatedTotalMs ?? 15000
  const progress = getEnrichmentProgress(elapsedMs, estimatedTotalMs)

  let detail = formatRemainingTime(progress.remainingMs)
  if (processingState === 'slow') {
    detail = 'Taking longer than usual'
  } else if (processingState === 'stuck') {
    detail = 'Still running in background'
  }

  return (
    <p
      className="mt-2 text-[11px] font-medium"
      style={{ color: 'var(--foreground-muted)' }}
    >
      {stageLabel}
      {detail ? ` · ${detail}` : ''}
    </p>
  )
}

export function FeedCardTags({
  card,
  maxTags = 3,
}: {
  card: FeedCardRecord
  maxTags?: number
}) {
  const processingState = getProcessingState(card.metadata)
  const tags = card.tags ?? []

  if (tags.length === 0 && processingState === 'idle') {
    return null
  }

  if (tags.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          marginTop: 8,
        }}
      >
        {[56, 74, 62].map((width, index) => (
          <span
            key={`${card.id}-placeholder-${index}`}
            className="animate-pulse"
            style={{
              width,
              height: 18,
              borderRadius: 9999,
              backgroundColor: 'var(--shimmer-base)',
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 8,
      }}
    >
      {tags.slice(0, maxTags).map((tag) => {
        const color = getTagColor(tag)
        return (
          <span
            key={tag}
            style={{
              fontSize: 10,
              padding: '4px 8px',
              borderRadius: 9999,
              backgroundColor: color.bg,
              color: color.text,
              lineHeight: 1,
            }}
          >
            {tag}
          </span>
        )
      })}
    </div>
  )
}

export function FeedCardBody({
  card,
  showSummary = false,
}: {
  card: FeedCardRecord
  showSummary?: boolean
}) {
  const summary = card.metadata?.summary

  return (
    <div style={{ padding: '8px 12px 12px' }}>
      {card.title && (
        <h3
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--foreground)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            margin: '0 0 4px',
            lineHeight: 1.4,
          }}
        >
          {card.title}
        </h3>
      )}

      {showSummary && summary && (
        <p
          className="hidden md:block"
          style={{
            fontSize: 11,
            color: 'var(--foreground-muted)',
            lineHeight: 1.45,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {summary}
          </span>
        </p>
      )}

      <FeedCardStatus card={card} />
      <FeedCardTags card={card} />
    </div>
  )
}
