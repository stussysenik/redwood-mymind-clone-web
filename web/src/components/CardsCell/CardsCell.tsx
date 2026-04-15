import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { AlignJustify, ImageIcon, LayoutGrid, Rows3 } from 'lucide-react'
import type { CardsQuery, CardsQueryVariables } from 'types/graphql'

import {
  type CellFailureProps,
  type CellSuccessProps,
  useMutation,
} from '@redwoodjs/web'

import { CardDetailModal } from 'src/components/CardDetailModal/CardDetailModal'
import {
  toFeedCard,
  type FeedCardRecord,
} from 'src/components/FeedCellShared/FeedCellShared'
import { FeedCollectionView } from 'src/components/FeedCollectionView/FeedCollectionView'
import { ViewModeToggle } from 'src/components/ViewModeToggle/ViewModeToggle'
import { usePersistedViewMode } from 'src/hooks/usePersistedViewMode'
import {
  mergeFeedCardRecord,
  useRealtimeCardUpdates,
} from 'src/lib/realtimeCards'
import {
  ARCHIVE_CARD_MUTATION,
  UNARCHIVE_CARD_MUTATION,
  RESTORE_CARD_MUTATION,
  makeOptimisticCardAction,
} from 'src/lib/cardMutations'
import type { Card } from 'src/lib/types'

export const QUERY = gql`
  query CardsQuery($page: Int!, $pageSize: Int!, $mode: CardMode!) {
    cards(page: $page, pageSize: $pageSize, mode: $mode) {
      cards {
        id
        userId
        type
        title
        content
        url
        imageUrl
        metadata
        tags
        createdAt
        updatedAt
        archivedAt
        deletedAt
      }
      total
      page
      pageSize
      hasMore
    }
  }
`

/**
 * Loading skeleton — masonry layout with shimmer placeholders of varying heights.
 * Uses the same CSS columns approach as the real grid so the skeleton
 * feels spatially consistent while data loads.
 */
export const Loading = () => {
  // Fixed heights so they don't re-randomize on each render
  const heights = [180, 260, 160, 300, 200, 240, 280, 190]
  return (
    <div className="px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="masonry-grid">
        {heights.map((h) => (
          <div key={h} className="masonry-item">
            <div
              className="animate-pulse"
              style={{
                height: h,
                borderRadius: 12,
                backgroundColor: 'var(--shimmer-base)',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Empty state — centered serif italic prompt, BYOA aesthetic.
 */
export const Empty = () => (
  <div
    className="flex flex-col items-center justify-center px-4 py-32"
    style={{ minHeight: '60vh' }}
  >
    <p
      className="font-display text-2xl italic"
      style={{ color: 'var(--foreground-muted)' }}
    >
      Nothing saved yet
    </p>
  </div>
)

// A card "has an image" when it ships a primary imageUrl or its metadata
// lists one or more image URLs (carousels, slideshows). Notes and URL-only
// cards without imagery get filtered out when the Images-only toggle is on.
function cardHasImage(card: FeedCardRecord): boolean {
  if (card.imageUrl) return true
  const meta = (card.metadata ?? {}) as Record<string, unknown>
  const images = meta.images
  return Array.isArray(images) && images.length > 0
}

export const Failure = ({ error }: CellFailureProps) => (
  <div
    className="px-4 py-20 text-center"
    style={{ color: 'var(--foreground-muted)' }}
  >
    <p className="text-sm">Error loading cards: {error?.message}</p>
  </div>
)

export const Success = ({
  cards: data,
  mode,
  onPageChange,
}: CellSuccessProps<CardsQuery, CardsQueryVariables> & {
  mode?: string
  onPageChange?: (page: number) => void
}) => {
  const { cards, total, page, pageSize, hasMore } = data
  const [archiveMut] = useMutation(ARCHIVE_CARD_MUTATION)
  const [unarchiveMut] = useMutation(UNARCHIVE_CARD_MUTATION)
  const [restoreMut] = useMutation(RESTORE_CARD_MUTATION)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [hiddenCardIds, setHiddenCardIds] = useState<Set<string>>(new Set())
  const [optimisticCards, setOptimisticCards] = useState<FeedCardRecord[]>([])
  const [liveCards, setLiveCards] = useState<Record<string, FeedCardRecord>>({})
  const [viewMode, setViewMode] = usePersistedViewMode(
    'byoa_library_view_mode',
    ['grid', 'list', 'dense'] as const,
    'grid'
  )
  const [imagesOnly, setImagesOnly] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('byoa_library_images_only') === '1'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      'byoa_library_images_only',
      imagesOnly ? '1' : '0'
    )
  }, [imagesOnly])
  const mergedCards = useMemo(
    () => [
      ...optimisticCards
        .filter(
          (optimisticCard) =>
            !cards.some((serverCard) => serverCard.id === optimisticCard.id)
        )
        .map((card) => liveCards[card.id] ? mergeFeedCardRecord(card, liveCards[card.id]) : card),
      ...cards.map((card) => {
        const feedCard = card as FeedCardRecord
        return liveCards[card.id]
          ? mergeFeedCardRecord(feedCard, liveCards[card.id])
          : feedCard
      }),
    ],
    [cards, liveCards, optimisticCards]
  )
  const visibleTotal = Math.max(
    0,
    total + optimisticCards.length - hiddenCardIds.size
  )
  const totalPages = Math.max(1, Math.ceil(visibleTotal / pageSize))
  const visibleTotalLabel = new Intl.NumberFormat().format(visibleTotal)
  const visibleCards = mergedCards.filter((card) => {
    if (hiddenCardIds.has(card.id)) return false
    if (imagesOnly && !cardHasImage(card)) return false
    if (mode === 'ARCHIVE') return !card.deletedAt
    if (mode === 'TRASH') return true
    return !card.archivedAt && !card.deletedAt
  })

  useEffect(() => {
    if (
      selectedCard &&
      !visibleCards.some((card) => card.id === selectedCard.id)
    ) {
      setSelectedCard(null)
    }
  }, [selectedCard, visibleCards])

  useEffect(() => {
    setOptimisticCards((current) =>
      current.filter(
        (optimisticCard) =>
          !cards.some((serverCard) => serverCard.id === optimisticCard.id)
      )
    )
  }, [cards])

  const handleRealtimeCardUpdate = useCallback((updatedCard: FeedCardRecord) => {
    setLiveCards((current) => ({
      ...current,
      [updatedCard.id]: updatedCard,
    }))

    setOptimisticCards((current) =>
      current.map((card) =>
        card.id === updatedCard.id
          ? mergeFeedCardRecord(card, updatedCard)
          : card
      )
    )

    setSelectedCard((current) =>
      current?.id === updatedCard.id ? toFeedCard(updatedCard) : current
    )
  }, [])

  useRealtimeCardUpdates(handleRealtimeCardUpdate)

  useEffect(() => {
    const handleCardSaved = (event: Event) => {
      const detail = (event as CustomEvent<Partial<FeedCardRecord>>).detail
      if (!detail?.id) {
        return
      }

      const optimisticCard: FeedCardRecord = {
        id: detail.id,
        userId: detail.userId ?? null,
        type: detail.type ?? 'website',
        title: detail.title ?? null,
        content: detail.content ?? null,
        url: detail.url ?? null,
        imageUrl: detail.imageUrl ?? null,
        metadata: detail.metadata ?? {},
        tags: detail.tags ?? [],
        createdAt: detail.createdAt ?? new Date().toISOString(),
        updatedAt: detail.updatedAt ?? detail.createdAt ?? new Date().toISOString(),
        archivedAt: detail.archivedAt ?? null,
        deletedAt: detail.deletedAt ?? null,
      }

      setOptimisticCards((current) => {
        const next = current.filter((card) => card.id !== optimisticCard.id)
        return [optimisticCard, ...next]
      })
    }

    const handleCardsChanged = () => {
      setOptimisticCards([])
    }

    window.addEventListener('card-saved', handleCardSaved)
    window.addEventListener('cards-changed', handleCardsChanged)

    return () => {
      window.removeEventListener('card-saved', handleCardSaved)
      window.removeEventListener('cards-changed', handleCardsChanged)
    }
  }, [])

  const handleArchive = makeOptimisticCardAction(archiveMut, selectedCard, setSelectedCard, setHiddenCardIds)
  const handleUnarchive = makeOptimisticCardAction(unarchiveMut, selectedCard, setSelectedCard, setHiddenCardIds)
  const handleRestore = makeOptimisticCardAction(restoreMut, selectedCard, setSelectedCard, setHiddenCardIds)

  const headerLabel = mode === 'ARCHIVE' ? 'Archive' : mode === 'TRASH' ? 'Trash' : 'Library'

  return (
    <div className="px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/*
       * Header — single-row information architecture.
       * Left cluster answers "where am I in the data?" (identity + count + page position).
       * Right cluster answers "how do I want to see it?" (filters + view mode).
       * flex-wrap lets the two clusters stack cleanly on narrow viewports.
       */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 sm:mb-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div
            className="inline-flex items-baseline gap-1.5"
            role="status"
            aria-live="polite"
          >
            <span
              className="text-xs font-medium sm:text-sm"
              style={{ color: 'var(--foreground-muted)' }}
            >
              {headerLabel}
            </span>
            <strong
              className="text-sm font-semibold"
              style={{
                color: 'var(--foreground)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {visibleTotalLabel}
            </strong>
            <span
              className="text-xs sm:text-sm"
              style={{ color: 'var(--foreground-muted)' }}
            >
              cards
            </span>
          </div>

          {totalPages > 1 && onPageChange && (
            <>
              <span
                aria-hidden="true"
                className="hidden h-3.5 w-px sm:block"
                style={{ backgroundColor: 'var(--border-subtle)' }}
              />
              <nav
                aria-label="Pagination"
                className="inline-flex items-center gap-0.5"
              >
                <button
                  type="button"
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-25 sm:h-8 sm:w-8"
                  style={{ color: 'var(--foreground)' }}
                >
                  &lsaquo;
                </button>
                <div
                  className="inline-flex items-baseline gap-1 px-1.5 text-xs font-medium sm:text-sm"
                  style={{
                    color: 'var(--foreground-muted)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    value={page}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val) && val >= 1 && val <= totalPages) {
                        onPageChange(val)
                      }
                    }}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (isNaN(val) || val < 1) onPageChange(1)
                      else if (val > totalPages) onPageChange(totalPages)
                    }}
                    className="w-6 bg-transparent text-center font-semibold outline-none"
                    style={{ color: 'var(--foreground)' }}
                    aria-label="Current page"
                  />
                  <span>/</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={totalPages}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val) && val >= 1 && val <= totalPages) {
                        onPageChange(val)
                      }
                    }}
                    className="w-6 bg-transparent text-center outline-none"
                    aria-label="Total pages — type to jump"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-25 sm:h-8 sm:w-8"
                  style={{ color: 'var(--foreground)' }}
                >
                  &rsaquo;
                </button>
              </nav>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImagesOnly((v) => !v)}
            aria-pressed={imagesOnly}
            aria-label={
              imagesOnly
                ? 'Show all cards'
                : 'Show only cards that have an image'
            }
            title={imagesOnly ? 'Showing images only' : 'Images only'}
            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:h-9 sm:px-3"
            style={{
              backgroundColor: imagesOnly
                ? 'var(--accent-light)'
                : 'var(--surface-soft)',
              borderColor: imagesOnly
                ? 'var(--accent-primary)'
                : 'var(--border-subtle)',
              color: imagesOnly
                ? 'var(--accent-primary)'
                : 'var(--foreground-muted)',
            }}
          >
            <ImageIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Images</span>
          </button>
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            ariaLabel="Library view"
            options={[
              {
                value: 'grid',
                label: 'Grid',
                icon: <LayoutGrid className="h-4 w-4" />,
              },
              {
                value: 'list',
                label: 'List',
                icon: <Rows3 className="h-4 w-4" />,
              },
              {
                value: 'dense',
                label: 'Dense',
                icon: <AlignJustify className="h-4 w-4" />,
              },
            ]}
          />
        </div>
      </header>

      {/* Masonry grid — 2 cols mobile, 3 cols desktop (CSS columns) */}
      {visibleCards.length === 0 ? (
        <Empty />
      ) : (
        <FeedCollectionView
          cards={visibleCards as FeedCardRecord[]}
          viewMode={viewMode}
          onOpenCard={(card) => setSelectedCard(toFeedCard(card))}
        />
      )}

      {/* Detail modal — opens when a card is clicked */}
      <CardDetailModal
        card={selectedCard}
        isOpen={selectedCard !== null}
        onClose={() => setSelectedCard(null)}
        onArchive={mode === 'ARCHIVE' ? undefined : handleArchive}
        onRestore={mode === 'ARCHIVE' ? handleUnarchive : mode === 'TRASH' ? handleRestore : undefined}
      />
    </div>
  )
}
