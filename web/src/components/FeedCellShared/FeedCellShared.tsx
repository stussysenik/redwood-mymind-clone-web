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

import { navigate } from '@redwoodjs/router'

import { AnalyzingIndicator } from 'src/components/AnalyzingIndicator'
import { getTagColor } from 'src/components/TagDisplay/TagDisplay'
import {
  formatRemainingTime,
  getEnrichmentProgress,
  getProcessingState,
} from 'src/lib/enrichment-timing'
import { getTrustedCardVisualSources } from 'src/lib/imageProxy'
import {
  ENRICHMENT_PROGRESS_STAGES,
  toProgressEnrichmentStage,
} from 'src/lib/semantic'
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

function getHumanSourceLabel(url: string | null | undefined): string | null {
  const domain = getDomainLabel(url)
  if (!domain) {
    return null
  }

  const root = domain.split('.')[0]?.replace(/[-_]+/g, ' ').trim()
  if (!root) {
    return domain
  }

  return root.replace(/\b\w/g, (char) => char.toUpperCase())
}

function getVisualBadges(card: FeedCardRecord): string[] {
  const badges: string[] = []
  const domainLabel = getDomainLabel(card.url)
  const images = Array.isArray(card.metadata?.images)
    ? card.metadata.images
    : []
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
  if (isNoteCard(card)) {
    return []
  }

  return getTrustedCardVisualSources(card)
}

function getDisplayTitle(card: FeedCardRecord): string {
  const title = card.title?.trim()
  if (title) {
    return title
  }

  if (getProcessingState(card.metadata) !== 'idle') {
    const source = getHumanSourceLabel(card.url)
    return source ? `Saving from ${source}` : 'Saving item'
  }

  return 'Untitled'
}

function getProcessingCopy(card: FeedCardRecord): {
  stageLabel: string
  detail: string
} | null {
  const processingState = getProcessingState(card.metadata)

  if (processingState === 'idle' || processingState === 'failed') {
    return null
  }

  const progressStage = toProgressEnrichmentStage(
    card.metadata?.enrichmentStage
  )
  const stageLabel =
    ENRICHMENT_PROGRESS_STAGES.find((stage) => stage.name === progressStage)
      ?.label ?? 'Analyzing'

  const timing = card.metadata?.enrichmentTiming
  const elapsedMs = timing?.startedAt
    ? Math.max(0, Date.now() - timing.startedAt)
    : 0
  const estimatedTotalMs = timing?.estimatedTotalMs ?? 15000
  const progress = getEnrichmentProgress(elapsedMs, estimatedTotalMs)

  let detail = formatRemainingTime(progress.remainingMs)
  if (processingState === 'slow') {
    detail = 'Taking longer than usual'
  } else if (processingState === 'stuck') {
    detail = 'Still running in background'
  }

  return {
    stageLabel,
    detail,
  }
}

function renderGradient(
  card: FeedCardRecord,
  variant: 'stacked' | 'row' = 'stacked'
) {
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
        minHeight: variant === 'row' ? '100%' : 140,
        borderRadius: variant === 'row' ? '18px' : '12px 12px 0 0',
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
  variant = 'stacked',
}: {
  title?: string | null
  content?: string | null
  variant?: 'stacked' | 'row'
}) {
  return (
    <div
      style={{
        background:
          'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 50%, #FFCC80 100%)',
        borderRadius: variant === 'row' ? '18px' : '12px 12px 0 0',
        padding: '24px 16px',
        minHeight: variant === 'row' ? '100%' : 140,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <p
        className="text-center font-display"
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

export function FeedCardVisual({
  card,
  variant = 'stacked',
  showBadges = true,
  showProcessingIndicator = true,
}: {
  card: FeedCardRecord
  variant?: 'stacked' | 'row'
  showBadges?: boolean
  showProcessingIndicator?: boolean
}) {
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
        borderRadius: variant === 'row' ? '14px' : '12px 12px 0 0',
        aspectRatio: '4 / 3',
        backgroundColor: 'var(--shimmer-base)',
        width: '100%',
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
    <NoteCardVisual
      title={card.title}
      content={card.content}
      variant={variant}
    />
  ) : (
    renderGradient(card, variant)
  )

  return (
    <div className="relative">
      {visual}
      {showBadges && visualBadges.length > 0 && (
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
      {showProcessingIndicator &&
        processingState !== 'idle' &&
        processingState !== 'failed' && (
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
  const processingCopy = getProcessingCopy(card)

  if (!processingCopy) {
    return null
  }

  return (
    <p
      className="mt-2 text-[11px] font-medium"
      style={{ color: 'var(--foreground-muted)' }}
    >
      {processingCopy.stageLabel}
      {processingCopy.detail ? ` · ${processingCopy.detail}` : ''}
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

/**
 * Dense row — McMaster-Carr style single-line item.
 * No images, no cards. Just type icon, title, domain, and date on one line
 * with a bottom border separator and a hover highlight.
 */
export function FeedCardDenseRow({
  card,
  onOpen,
}: {
  card: FeedCardRecord
  onOpen: () => void
}) {
  const TypeIcon = TYPE_ICONS[normalizeCardType(card.type)] ?? Globe
  const domain = getDomainLabel(card.url)
  const dateLabel = new Date(card.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  })

  return (
    <div
      className="group flex w-full cursor-pointer items-center gap-3 border-b px-2 py-1.5 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      role="button"
      tabIndex={0}
      aria-label={
        card.title
          ? `Open ${card.type} card: ${card.title}`
          : `Open ${card.type} card`
      }
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      style={{
        borderColor: 'var(--border-subtle)',
      }}
    >
      <TypeIcon
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: 'var(--foreground-muted)' }}
      />
      <span
        className="min-w-0 flex-1 truncate text-[13px] tracking-tight font-medium"
        style={{ color: 'var(--foreground)' }}
      >
        {card.title || 'Untitled'}
      </span>
      {domain && (
        <span
          className="hidden shrink-0 font-mono text-[11px] sm:inline"
          style={{ color: 'var(--foreground-muted)' }}
        >
          {domain}
        </span>
      )}
      <span
        className="shrink-0 font-mono text-[11px] tabular-nums"
        style={{ color: 'var(--foreground-muted)' }}
      >
        {dateLabel}
      </span>
    </div>
  )
}

export function FeedCardListItem({
  card,
  onOpen,
  showSummary = true,
}: {
  card: FeedCardRecord
  onOpen: () => void
  showSummary?: boolean
}) {
  const summary = card.metadata?.summary
  const domainLabel = getDomainLabel(card.url)
  const visualBadges = getVisualBadges(card).filter(
    (badge) => badge !== domainLabel
  )
  const processingCopy = getProcessingCopy(card)
  const displayTitle = getDisplayTitle(card)
  const fallbackSummary =
    !summary && processingCopy
      ? 'Capturing the visual, title, and source details before it settles into your library.'
      : null

  return (
    <div
      className="feed-list-item group"
      role="button"
      tabIndex={0}
      aria-label={
        card.title
          ? `Open ${card.type} card: ${card.title}`
          : `Open ${card.type} card`
      }
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '160px 1fr',
          gap: '12px',
          padding: '12px',
        }}
      >
        <div style={{ minWidth: 0, flexShrink: 0 }}>
          <FeedCardVisual
            card={card}
            variant="row"
            showBadges={false}
            showProcessingIndicator={false}
          />
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ minWidth: 0 }}>
            {domainLabel && (
              <p
                className="text-[10px] font-mono uppercase tracking-[0.12em] mb-1.5"
                style={{
                  color: 'var(--foreground-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {domainLabel}
                {visualBadges.length > 0 && (
                  <span className="ml-2">
                    {visualBadges.join(' · ')}
                  </span>
                )}
              </p>
            )}

            <h3
              className="font-display leading-[1.3]"
              style={{
                color: 'var(--foreground)',
                fontSize: '1.05rem',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                letterSpacing: '-0.02em',
              }}
            >
              {displayTitle}
            </h3>

            {showSummary && (summary || fallbackSummary) && (
              <p
                className="mt-1.5 text-[12px] leading-[1.6]"
                style={{
                  color: 'var(--foreground-muted)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {summary || fallbackSummary}
              </p>
            )}
          </div>

          <div className="mt-auto pt-3">
            {processingCopy ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <AnalyzingIndicator
                  variant="light"
                  size="sm"
                  label={processingCopy.stageLabel}
                />
                {processingCopy.detail && (
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: 'var(--foreground-muted)' }}
                  >
                    {processingCopy.detail}
                  </span>
                )}
              </div>
            ) : null}
            <FeedCardTags card={card} maxTags={5} />
          </div>
        </div>
      </div>
    </div>
  )
}
