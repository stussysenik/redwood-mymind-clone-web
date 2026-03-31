import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react'

import type { SearchCardsQuery, SearchCardsQueryVariables } from 'types/graphql'

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
  query SearchCardsQuery($query: String!, $type: String, $tag: String) {
    searchCards(query: $query, type: $type, tag: $tag) {
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
      mode
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

export const Loading = () => (
  <div className="px-4 py-6 sm:px-6">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[140, 160, 180, 200].map((height) => (
        <div
          key={height}
          className="animate-pulse rounded-xl"
          style={{
            backgroundColor: 'var(--shimmer-base)',
            height: `${height}px`,
          }}
        />
      ))}
    </div>
  </div>
)

export const Empty = () => (
  <div className="py-16 text-center">
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      No results found
    </p>
  </div>
)

export const Failure = ({ error }: CellFailureProps) => (
  <div className="py-10 text-center">
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Search error: {error?.message}
    </p>
  </div>
)

export const Success = ({
  searchCards,
}: CellSuccessProps<SearchCardsQuery, SearchCardsQueryVariables>) => {
  const { cards, total } = searchCards
  const [archiveCardMutation] = useMutation(ARCHIVE_CARD_MUTATION)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [hiddenCardIds, setHiddenCardIds] = useState<Set<string>>(new Set())
  const [liveCards, setLiveCards] = useState<Record<string, FeedCardRecord>>({})
  const visibleTotal = Math.max(0, total - hiddenCardIds.size)
  const visibleCards = useMemo(
    () =>
      cards
        .map((card) => {
          const feedCard = card as FeedCardRecord
          return liveCards[card.id]
            ? mergeFeedCardRecord(feedCard, liveCards[card.id])
            : feedCard
        })
        .filter(
          (card) => !hiddenCardIds.has(card.id) && !card.archivedAt && !card.deletedAt
        ),
    [cards, hiddenCardIds, liveCards]
  )

  useEffect(() => {
    if (
      selectedCard &&
      !visibleCards.some((card) => card.id === selectedCard.id)
    ) {
      setSelectedCard(null)
    }
  }, [selectedCard, visibleCards])

  const handleRealtimeCardUpdate = useCallback((updatedCard: FeedCardRecord) => {
    setLiveCards((current) => ({
      ...current,
      [updatedCard.id]: updatedCard,
    }))
    setSelectedCard((current) =>
      current?.id === updatedCard.id ? toFeedCard(updatedCard) : current
    )
  }, [])

  useRealtimeCardUpdates(handleRealtimeCardUpdate)

  const handleArchive = (id: string) => {
    const previousSelectedCard = selectedCard
    setHiddenCardIds((current) => new Set(current).add(id))

    if (previousSelectedCard?.id === id) {
      setSelectedCard(null)
    }

    void archiveCardMutation({ variables: { id } }).catch((error) => {
      console.error('[SearchCell] Archive failed:', error)
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
    <div className="px-4 py-6 sm:px-6">
      <p className="mb-4 text-xs" style={{ color: 'var(--foreground-muted)' }}>
        {visibleTotal} results
      </p>
      {visibleCards.length === 0 ? (
        <Empty />
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(var(--masonry-columns), 1fr)' }}
        >
          {visibleCards.map((card) => (
            <div
              key={card.id}
              className="card-base cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() =>
                setSelectedCard(toFeedCard(card as FeedCardRecord))
              }
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedCard(toFeedCard(card as FeedCardRecord))
                }
              }}
            >
              <FeedCardVisual card={card as FeedCardRecord} />
              <FeedCardBody card={card as FeedCardRecord} />
            </div>
          ))}
        </div>
      )}

      <CardDetailModal
        card={selectedCard}
        isOpen={selectedCard !== null}
        onClose={() => setSelectedCard(null)}
        onArchive={handleArchive}
      />
    </div>
  )
}
