import { useEffect, useMemo, useState } from 'react'

import { navigate } from '@redwoodjs/router'

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
import { getBrowserImageUrl, getFallbackScreenshotUrl } from 'src/lib/imageProxy'
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

function getDomainLabel(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }

  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return null
  }
}

function getVisualBadges(card: FeedCardRecord): string[] {
  const badges: string[] = []
  const domainLabel = getDomainLabel(card.url)
  const images = Array.isArray(card.metadata?.images) ? card.metadata.images : []
  const mediaTypes = Array.isArray(card.metadata?.mediaTypes)
    ? card.metadata.mediaTypes
    : []
  const hasVideo =
    mediaTypes.includes('video') ||
    (Array.isArray(card.metadata?.videoPositions) &&
      card.metadata.videoPositions.length > 0)

  if (domainLabel) {
    badges.push(domainLabel)
  }

  if (hasVideo) {
    badges.push('Video')
  } else if (images.length > 1) {
    badges.push(`${images.length} slides`)
  }

  return badges.slice(0, 2)
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
    const browserUrl = getBrowserImageUrl(src)
    if (!browserUrl) return
    const trimmed = browserUrl.trim()
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
  const visualBadges = useMemo(() => getVisualBadges(card), [card])

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
        aspectRatio: '4 / 3',
        backgroundColor: 'var(--shimmer-base)',
      }}
    >
      <img
        src={activeSource.src}
        alt={card.title || 'Card visual'}
        loading="lazy"
        data-testid="feed-card-image"
        data-visual-kind={activeSource.kind}
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
      {visualBadges.length > 0 && (
        <div
          className="absolute bottom-2 left-2 z-[1] flex flex-wrap gap-1.5"
          aria-hidden="true"
        >
          {visualBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.88)',
                color: 'var(--foreground)',
                backdropFilter: 'blur(10px)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {badge}
            </span>
          ))}
        </div>
      )}
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
          <button
            key={tag}
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void navigate(`/?q=%23${encodeURIComponent(tag)}`)
            }}
            style={{
              fontSize: 10,
              padding: '4px 8px',
              borderRadius: 9999,
              backgroundColor: color.bg,
              border: 0,
              color: color.text,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            {tag}
          </button>
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
    <div style={{ padding: '12px 14px 14px' }}>
      {card.title && (
        <h3
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--foreground)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            margin: '0 0 6px',
            lineHeight: 1.35,
            textWrap: 'pretty',
          }}
        >
          {card.title}
        </h3>
      )}

      {showSummary && summary && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--foreground-muted)',
            lineHeight: 1.5,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
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
