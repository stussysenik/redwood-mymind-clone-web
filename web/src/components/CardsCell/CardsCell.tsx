import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react'

import type { CardsQuery, CardsQueryVariables } from 'types/graphql'

import {
  type CellFailureProps,
  type CellSuccessProps,
  useMutation,
} from '@redwoodjs/web'

import { CardDetailModal } from 'src/components/CardDetailModal/CardDetailModal'
import {
  FeedCardBody,
  FeedCardVisual,
  toFeedCard,
  type FeedCardRecord,
} from 'src/components/FeedCellShared/FeedCellShared'
import {
  mergeFeedCardRecord,
  useRealtimeCardUpdates,
} from 'src/lib/realtimeCards'
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

const ARCHIVE_CARD_MUTATION = gql`
  mutation ArchiveCardMutation($id: String!) {
    archiveCard(id: $id) {
      id
      archivedAt
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
 * Empty state — centered serif italic prompt, MyMind aesthetic.
 */
export const Empty = () => (
  <div
    className="flex flex-col items-center justify-center px-4 py-32"
    style={{ minHeight: '60vh' }}
  >
    <p
      className="font-serif text-2xl italic"
      style={{ color: 'var(--foreground-muted)' }}
    >
      Your mind, organized
    </p>
  </div>
)

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
  onNextPage,
  onPrevPage,
}: CellSuccessProps<CardsQuery, CardsQueryVariables> & {
  onNextPage?: () => void
  onPrevPage?: () => void
}) => {
  const { cards, total, page, pageSize, hasMore } = data
  const [archiveCardMutation] = useMutation(ARCHIVE_CARD_MUTATION)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [hiddenCardIds, setHiddenCardIds] = useState<Set<string>>(new Set())
  const [optimisticCards, setOptimisticCards] = useState<FeedCardRecord[]>([])
  const [liveCards, setLiveCards] = useState<Record<string, FeedCardRecord>>({})
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
  const visibleCards = mergedCards.filter(
    (card) => !hiddenCardIds.has(card.id) && !card.archivedAt && !card.deletedAt
  )

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

  const handleArchive = (id: string) => {
    const previousSelectedCard = selectedCard
    setHiddenCardIds((current) => new Set(current).add(id))

    if (previousSelectedCard?.id === id) {
      setSelectedCard(null)
    }

    void archiveCardMutation({ variables: { id } }).catch((error) => {
      console.error('[CardsCell] Archive failed:', error)
      setHiddenCardIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      if (previousSelectedCard?.id === id) {
        setSelectedCard(previousSelectedCard)
      }
    })
  }

  return (
    <div className="px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Card count */}
      <div className="mb-5 flex items-center justify-between">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
          role="status"
          aria-live="polite"
          style={{
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span
            className="text-[10px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--foreground-muted)' }}
          >
            Library
          </span>
          <strong
            className="text-sm"
            style={{
              color: 'var(--foreground)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {visibleTotalLabel}
          </strong>
          <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
            cards
          </span>
        </div>
      </div>

      {/* Masonry grid — 2 cols mobile, 3 cols desktop (CSS columns) */}
      {visibleCards.length === 0 ? (
        <Empty />
      ) : (
        <div className="masonry-grid">
          {visibleCards.map((card) => {
            const feedCard = card as FeedCardRecord

            return (
              <div key={card.id} className="masonry-item">
                <div
                  className="card-base feed-card-shell cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    feedCard.title
                      ? `Open ${feedCard.type} card: ${feedCard.title}`
                      : `Open ${feedCard.type} card`
                  }
                  onClick={() => setSelectedCard(toFeedCard(feedCard))}
                  onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedCard(toFeedCard(feedCard))
                    }
                  }}
                >
                  <FeedCardVisual card={feedCard} />
                  <FeedCardBody card={feedCard} showSummary />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="mt-8 flex flex-col items-center gap-3 pb-4">
          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
            Page {page} of {totalPages} — showing {visibleCards.length} of{' '}
            {visibleTotal}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 && onPrevPage && (
              <button
                onClick={onPrevPage}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--surface-card)',
                  color: 'var(--foreground)',
                  border: '1px solid var(--border-default)',
                }}
              >
                Previous
              </button>
            )}
            {hasMore && onNextPage && (
              <button
                onClick={onNextPage}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--foreground)',
                  color: 'var(--background)',
                }}
              >
                Next page
              </button>
            )}
          </div>
        </div>
      )}

      {/* Detail modal — opens when a card is clicked */}
      <CardDetailModal
        card={selectedCard}
        isOpen={selectedCard !== null}
        onClose={() => setSelectedCard(null)}
        onArchive={handleArchive}
      />
    </div>
  )
}
