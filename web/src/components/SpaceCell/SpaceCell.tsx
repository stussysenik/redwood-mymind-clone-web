import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { ChevronLeft, LayoutGrid, Rows3 } from 'lucide-react'
import type { SpaceQuery, SpaceQueryVariables } from 'types/graphql'

import { Link, routes } from '@redwoodjs/router'
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
import type { Card } from 'src/lib/types'

export const QUERY = gql`
  query SpaceQuery($id: String!) {
    space(id: $id) {
      id
      name
      query
      isSmart
      cardCount
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
  <div className="px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
    <div className="mb-6 animate-pulse">
      <div
        className="h-4 w-24 rounded"
        style={{ backgroundColor: 'var(--shimmer-base)' }}
      />
      <div
        className="mt-2 h-8 w-48 rounded"
        style={{ backgroundColor: 'var(--shimmer-base)' }}
      />
    </div>
    <div className="masonry-grid">
      {[180, 260, 160, 300, 200, 240].map((h) => (
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

export const Empty = () => (
  <div className="px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
    <Link
      to={routes.spaces()}
      className="mb-4 inline-flex items-center gap-1 text-sm hover:underline"
      style={{ color: 'var(--foreground-muted)' }}
    >
      <ChevronLeft className="h-4 w-4" /> Spaces
    </Link>
    <div
      className="py-20 text-center"
      style={{ color: 'var(--foreground-muted)' }}
    >
      <p className="text-sm">Space not found</p>
    </div>
  </div>
)

export const Failure = ({ error }: CellFailureProps) => (
  <div
    className="px-4 py-20 text-center"
    style={{ color: 'var(--foreground-muted)' }}
  >
    <p className="text-sm">Error: {error?.message}</p>
  </div>
)

export const Success = ({
  space,
}: CellSuccessProps<SpaceQuery, SpaceQueryVariables>) => {
  const [archiveCardMutation] = useMutation(ARCHIVE_CARD_MUTATION)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [hiddenCardIds, setHiddenCardIds] = useState<Set<string>>(new Set())
  const [liveCards, setLiveCards] = useState<Record<string, FeedCardRecord>>({})
  const [viewMode, setViewMode] = usePersistedViewMode(
    'mymind_space_view_mode',
    ['grid', 'list'] as const,
    'grid'
  )
  const cards = space?.cards || []
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
  const visibleCardCount = Math.max(
    0,
    (space?.cardCount ?? 0) - hiddenCardIds.size
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

  if (!space) return <Empty />

  const handleArchive = (id: string) => {
    const previousSelectedCard = selectedCard
    setHiddenCardIds((current) => new Set(current).add(id))

    if (previousSelectedCard?.id === id) {
      setSelectedCard(null)
    }

    void archiveCardMutation({ variables: { id } }).catch((error) => {
      console.error('[SpaceCell] Archive failed:', error)
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
      {/* Breadcrumb */}
      <Link
        to={routes.spaces()}
        className="mb-4 inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: 'var(--foreground-muted)' }}
      >
        <ChevronLeft className="h-4 w-4" /> Spaces
      </Link>

      {/* Space header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="font-serif text-2xl"
            style={{ color: 'var(--foreground)' }}
          >
            {space.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {space.query && (
              <span
                className="rounded-full px-2.5 py-1 text-xs"
                style={{
                  backgroundColor: 'var(--surface-accent)',
                  color: 'var(--accent-primary)',
                }}
              >
                #{space.query}
              </span>
            )}
            {space.isSmart && (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  color: 'var(--foreground-muted)',
                }}
              >
                Smart
              </span>
            )}
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                backgroundColor: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
                color: 'var(--foreground-muted)',
              }}
            >
              <strong
                className="text-sm"
                style={{
                  color: 'var(--foreground)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {new Intl.NumberFormat().format(visibleCardCount)}
              </strong>
              <span className="text-xs">
                card{visibleCardCount !== 1 ? 's' : ''}
              </span>
            </span>
          </div>
        </div>
        <ViewModeToggle
          value={viewMode}
          onChange={setViewMode}
          ariaLabel="Space view"
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
          ]}
        />
      </div>

      {/* Cards masonry grid */}
      {visibleCards.length === 0 ? (
        <div
          className="py-20 text-center"
          style={{ color: 'var(--foreground-muted)' }}
        >
          <p className="font-serif text-lg italic">
            No cards match this space yet
          </p>
        </div>
      ) : (
        <FeedCollectionView
          cards={visibleCards as FeedCardRecord[]}
          viewMode={viewMode}
          onOpenCard={(card) => setSelectedCard(toFeedCard(card))}
        />
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
