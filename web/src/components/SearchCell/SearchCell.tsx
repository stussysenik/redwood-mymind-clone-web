import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { AlignJustify, LayoutGrid, Rows3 } from 'lucide-react'
import type { SearchCardsQuery, SearchCardsQueryVariables } from 'types/graphql'

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
  makeOptimisticCardAction,
} from 'src/lib/cardMutations'
import type { Card } from 'src/lib/types'

export const QUERY = gql`
  query SearchCardsQuery($query: String!, $type: String, $tag: String, $mode: String) {
    searchCards(query: $query, type: $type, tag: $tag, mode: $mode) {
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
  mode,
}: CellSuccessProps<SearchCardsQuery, SearchCardsQueryVariables> & {
  mode?: string
}) => {
  const { cards, total } = searchCards
  const [archiveMut] = useMutation(ARCHIVE_CARD_MUTATION)
  const [unarchiveMut] = useMutation(UNARCHIVE_CARD_MUTATION)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [hiddenCardIds, setHiddenCardIds] = useState<Set<string>>(new Set())
  const [liveCards, setLiveCards] = useState<Record<string, FeedCardRecord>>({})
  const [viewMode, setViewMode] = usePersistedViewMode(
    'byoa_search_view_mode',
    ['grid', 'list', 'dense'] as const,
    'grid'
  )
  const visibleTotal = Math.max(0, total - hiddenCardIds.size)
  const visibleTotalLabel = new Intl.NumberFormat().format(visibleTotal)
  const visibleCards = useMemo(
    () =>
      cards
        .map((card) => {
          const feedCard = card as FeedCardRecord
          return liveCards[card.id]
            ? mergeFeedCardRecord(feedCard, liveCards[card.id])
            : feedCard
        })
        .filter((card) => {
          if (hiddenCardIds.has(card.id)) return false
          if (mode === 'ARCHIVE') return !card.deletedAt
          if (mode === 'TRASH') return true
          return !card.archivedAt && !card.deletedAt
        }),
    [cards, hiddenCardIds, liveCards, mode]
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

  const handleArchive = makeOptimisticCardAction(archiveMut, selectedCard, setSelectedCard, setHiddenCardIds)
  const handleUnarchive = makeOptimisticCardAction(unarchiveMut, selectedCard, setSelectedCard, setHiddenCardIds)

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
        <div
          className="inline-flex items-baseline gap-1.5"
          role="status"
          aria-live="polite"
        >
          <span
            className="text-xs font-medium sm:text-sm"
            style={{ color: 'var(--foreground-muted)' }}
          >
            Search
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
            results
          </span>
        </div>
        <ViewModeToggle
          value={viewMode}
          onChange={setViewMode}
          ariaLabel="Search view"
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
      {visibleCards.length === 0 ? (
        <Empty />
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
        onArchive={mode === 'ARCHIVE' ? undefined : handleArchive}
        onRestore={mode === 'ARCHIVE' ? handleUnarchive : undefined}
        restoreLabel={mode === 'ARCHIVE' ? 'Unarchive' : 'Restore'}
      />
    </div>
  )
}
