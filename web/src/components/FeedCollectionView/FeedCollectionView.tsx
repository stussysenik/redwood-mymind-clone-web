import type { KeyboardEvent } from 'react'

import {
  FeedCardBody,
  FeedCardListItem,
  FeedCardVisual,
  type FeedCardRecord,
} from 'src/components/FeedCellShared/FeedCellShared'

interface FeedCollectionViewProps {
  cards: FeedCardRecord[]
  viewMode: 'grid' | 'list'
  onOpenCard: (card: FeedCardRecord) => void
}

function handleKeyOpen(
  event: KeyboardEvent<HTMLDivElement>,
  onOpenCard: () => void
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpenCard()
  }
}

export function FeedCollectionView({
  cards,
  viewMode,
  onOpenCard,
}: FeedCollectionViewProps) {
  if (viewMode === 'list') {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map((card) => (
          <FeedCardListItem
            key={card.id}
            card={card}
            onOpen={() => onOpenCard(card)}
            showSummary
          />
        ))}
      </div>
    )
  }

  return (
    <div className="masonry-grid">
      {cards.map((card) => (
        <div key={card.id} className="masonry-item">
          <div
            className="card-base feed-card-shell cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={
              card.title
                ? `Open ${card.type} card: ${card.title}`
                : `Open ${card.type} card`
            }
            onClick={() => onOpenCard(card)}
            onKeyDown={(event) => handleKeyOpen(event, () => onOpenCard(card))}
          >
            <FeedCardVisual card={card} />
            <FeedCardBody card={card} showSummary />
          </div>
        </div>
      ))}
    </div>
  )
}
