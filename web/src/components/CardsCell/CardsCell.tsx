import { useState } from 'react'

import type { CardsQuery, CardsQueryVariables } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

import { CardDetailModal } from 'src/components/CardDetailModal/CardDetailModal'
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
        {heights.map((h, i) => (
          <div key={i} className="masonry-item">
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
    className="flex flex-col items-center justify-center py-32 px-4"
    style={{ minHeight: '60vh' }}
  >
    <p
      className="font-serif italic text-2xl"
      style={{ color: 'var(--foreground-muted)' }}
    >
      Your mind, organized
    </p>
  </div>
)

export const Failure = ({ error }: CellFailureProps) => (
  <div
    className="text-center py-20 px-4"
    style={{ color: 'var(--foreground-muted)' }}
  >
    <p className="text-sm">Error loading cards: {error?.message}</p>
  </div>
)

/**
 * NoteCardVisual — warm gradient background for cards without images.
 * Renders the card content or title as the hero visual element,
 * giving note/text-only cards a distinctive visual presence in the grid.
 */
const NoteCardVisual = ({
  title,
  content,
}: {
  title?: string | null
  content?: string | null
}) => (
  <div
    style={{
      background:
        'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 50%, #FFCC80 100%)',
      padding: '24px 16px',
      minHeight: 120,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <p
      className="font-serif text-center"
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

export const Success = ({
  cards: data,
}: CellSuccessProps<CardsQuery, CardsQueryVariables>) => {
  const { cards, total, page, hasMore } = data
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  /**
   * Convert a GraphQL card object to the Card type expected by CardDetailModal.
   * The GraphQL type uses `Prisma.JsonValue` for metadata and `string` for type,
   * while the Card interface uses `CardMetadata` and `CardType`.
   */
  const toCard = (gqlCard: (typeof cards)[number]): Card => ({
    id: gqlCard.id,
    userId: gqlCard.userId,
    type: gqlCard.type as Card['type'],
    title: gqlCard.title ?? null,
    content: gqlCard.content ?? null,
    url: gqlCard.url ?? null,
    imageUrl: gqlCard.imageUrl ?? null,
    metadata: (gqlCard.metadata ?? {}) as Card['metadata'],
    tags: gqlCard.tags ?? [],
    createdAt: gqlCard.createdAt,
    updatedAt: gqlCard.updatedAt,
    deletedAt: gqlCard.deletedAt ?? null,
    archivedAt: gqlCard.archivedAt ?? null,
  })

  return (
    <div className="px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Card count */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
          {total} cards
        </p>
      </div>

      {/* Masonry grid — 2 cols mobile, 3 cols desktop (CSS columns) */}
      <div className="masonry-grid">
        {cards.map((card) => {
          const hasImage = !!card.imageUrl
          const isNote =
            card.type === 'NOTE' ||
            card.type === 'note' ||
            (!hasImage && !card.url)

          return (
            <div key={card.id} className="masonry-item">
              <div
                className="card-base cursor-pointer"
                onClick={() => setSelectedCard(toCard(card))}
              >
                {/* Hero area: full-width image or note gradient */}
                {hasImage ? (
                  <img
                    src={card.imageUrl!}
                    alt={card.title || ''}
                    loading="lazy"
                    style={{
                      width: '100%',
                      display: 'block',
                      borderRadius: '12px 12px 0 0',
                      objectFit: 'cover',
                    }}
                  />
                ) : isNote ? (
                  <NoteCardVisual
                    title={card.title}
                    content={card.content}
                  />
                ) : null}

                {/* Content area — compact padding, tight typography */}
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

                  {/* Summary: hidden on mobile, 2-line clamp on desktop */}
                  {card.metadata?.summary && (
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
                        {(card.metadata as any).summary}
                      </span>
                    </p>
                  )}

                  {/* Tag pills */}
                  {card.tags && card.tags.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 4,
                        marginTop: 4,
                      }}
                    >
                      {card.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            padding: '4px 8px',
                            borderRadius: 9999,
                            backgroundColor: 'var(--surface-soft)',
                            color: 'var(--foreground-muted)',
                            lineHeight: 1,
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {hasMore && (
        <div className="flex justify-center mt-8">
          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
            Page {page} — showing {cards.length} of {total}
          </p>
        </div>
      )}

      {/* Detail modal — opens when a card is clicked */}
      <CardDetailModal
        card={selectedCard}
        isOpen={selectedCard !== null}
        onClose={() => setSelectedCard(null)}
      />
    </div>
  )
}
