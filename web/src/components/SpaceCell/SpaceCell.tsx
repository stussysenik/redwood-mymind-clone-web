import { useState } from 'react'

import { Link, routes } from '@redwoodjs/router'
import type { SpaceQuery, SpaceQueryVariables } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

import { CardDetailModal } from 'src/components/CardDetailModal/CardDetailModal'
import { getTagColor } from 'src/components/TagDisplay/TagDisplay'
import type { Card } from 'src/lib/types'
import { ChevronLeft } from 'lucide-react'

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

export const Loading = () => (
  <div className="px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
    <div className="animate-pulse mb-6">
      <div className="h-4 w-24 rounded" style={{ backgroundColor: 'var(--shimmer-base)' }} />
      <div className="h-8 w-48 rounded mt-2" style={{ backgroundColor: 'var(--shimmer-base)' }} />
    </div>
    <div className="masonry-grid">
      {[180, 260, 160, 300, 200, 240].map((h, i) => (
        <div key={i} className="masonry-item">
          <div
            className="animate-pulse"
            style={{ height: h, borderRadius: 12, backgroundColor: 'var(--shimmer-base)' }}
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
      className="inline-flex items-center gap-1 text-sm mb-4 hover:underline"
      style={{ color: 'var(--foreground-muted)' }}
    >
      <ChevronLeft className="h-4 w-4" /> Spaces
    </Link>
    <div className="text-center py-20" style={{ color: 'var(--foreground-muted)' }}>
      <p className="text-sm">Space not found</p>
    </div>
  </div>
)

export const Failure = ({ error }: CellFailureProps) => (
  <div className="text-center py-20 px-4" style={{ color: 'var(--foreground-muted)' }}>
    <p className="text-sm">Error: {error?.message}</p>
  </div>
)

const NoteCardVisual = ({ title, content }: { title?: string | null; content?: string | null }) => (
  <div
    style={{
      background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 50%, #FFCC80 100%)',
      padding: '24px 16px', minHeight: 120,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
  >
    <p
      className="font-serif text-center"
      style={{
        fontSize: 16, lineHeight: 1.5, color: '#5D4037',
        display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', wordBreak: 'break-word',
      }}
    >
      {content || title || 'Note'}
    </p>
  </div>
)

export const Success = ({
  space,
}: CellSuccessProps<SpaceQuery, SpaceQueryVariables>) => {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  if (!space) return <Empty />

  const cards = space.cards || []

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
      {/* Breadcrumb */}
      <Link
        to={routes.spaces()}
        className="inline-flex items-center gap-1 text-sm mb-4 hover:underline"
        style={{ color: 'var(--foreground-muted)' }}
      >
        <ChevronLeft className="h-4 w-4" /> Spaces
      </Link>

      {/* Space header */}
      <div className="mb-6">
        <h1 className="font-serif text-2xl" style={{ color: 'var(--foreground)' }}>
          {space.name}
        </h1>
        <div className="flex items-center gap-3 mt-2">
          {space.query && (
            <span
              className="text-xs px-2.5 py-1 rounded-full"
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
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--surface-soft)',
                color: 'var(--foreground-muted)',
              }}
            >
              Smart
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
            {space.cardCount} card{space.cardCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Cards masonry grid */}
      {cards.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--foreground-muted)' }}>
          <p className="font-serif italic text-lg">No cards match this space yet</p>
        </div>
      ) : (
        <div className="masonry-grid">
          {cards.map((card) => {
            const hasImage = !!card.imageUrl
            const isNote = card.type === 'NOTE' || card.type === 'note' || (!hasImage && !card.url)

            return (
              <div key={card.id} className="masonry-item">
                <div
                  className="card-base cursor-pointer"
                  onClick={() => setSelectedCard(toCard(card))}
                >
                  {hasImage ? (
                    <img
                      src={card.imageUrl!}
                      alt={card.title || ''}
                      loading="lazy"
                      style={{
                        width: '100%', display: 'block',
                        borderRadius: '12px 12px 0 0', objectFit: 'cover',
                      }}
                    />
                  ) : isNote ? (
                    <NoteCardVisual title={card.title} content={card.content} />
                  ) : null}

                  <div style={{ padding: '8px 12px 12px' }}>
                    {card.title && (
                      <h3 style={{
                        fontSize: 13, fontWeight: 500, color: 'var(--foreground)',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden', margin: '0 0 4px', lineHeight: 1.4,
                      }}>
                        {card.title}
                      </h3>
                    )}

                    {(card.metadata as any)?.summary && (
                      <p
                        className="hidden md:block"
                        style={{
                          fontSize: 11, color: 'var(--foreground-muted)',
                          lineHeight: 1.45, marginBottom: 6,
                        }}
                      >
                        <span style={{
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {(card.metadata as any).summary}
                        </span>
                      </p>
                    )}

                    {card.tags?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {card.tags.slice(0, 3).map((tag) => {
                          const color = getTagColor(tag)
                          return (
                            <span
                              key={tag}
                              style={{
                                fontSize: 10, padding: '4px 8px', borderRadius: 9999,
                                backgroundColor: color.bg, color: color.text, lineHeight: 1,
                              }}
                            >
                              {tag}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CardDetailModal
        card={selectedCard}
        isOpen={selectedCard !== null}
        onClose={() => setSelectedCard(null)}
      />
    </div>
  )
}
