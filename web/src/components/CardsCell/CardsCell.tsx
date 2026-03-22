import type { CardsQuery, CardsQueryVariables } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

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

export const Loading = () => (
  <div className="px-4 sm:px-6 py-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl animate-pulse"
          style={{
            backgroundColor: 'var(--shimmer-base)',
            height: `${180 + Math.random() * 120}px`,
            borderRadius: 'var(--radius-md)',
          }}
        />
      ))}
    </div>
  </div>
)

export const Empty = () => (
  <div className="text-center py-20">
    <p
      className="font-serif text-xl mb-2"
      style={{ color: 'var(--foreground)' }}
    >
      Your mind, organized
    </p>
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Save articles, images, notes, and more
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

export const Success = ({
  cards: data,
}: CellSuccessProps<CardsQuery, CardsQueryVariables>) => {
  const { cards, total, page, pageSize, hasMore } = data

  return (
    <div className="px-4 sm:px-6 py-6">
      {/* Card count */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
          {total} cards
        </p>
      </div>

      {/* Masonry grid — mobile-first: 1 col → 2 → 3 → 4 → 5 */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(var(--masonry-columns), 1fr)`,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.id}
            className="card-base cursor-pointer"
            style={{ breakInside: 'avoid' }}
          >
            {/* Card image */}
            {card.imageUrl && (
              <img
                src={card.imageUrl}
                alt={card.title || ''}
                className="w-full object-cover"
                style={{
                  maxHeight: '200px',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                }}
                loading="lazy"
              />
            )}

            {/* Card content */}
            <div className="p-3">
              {card.title && (
                <h3
                  className="text-sm font-medium line-clamp-2 mb-1"
                  style={{ color: 'var(--foreground)' }}
                >
                  {card.title}
                </h3>
              )}

              {card.metadata?.summary && (
                <p
                  className="text-xs line-clamp-3 mb-2"
                  style={{ color: 'var(--foreground-muted)' }}
                >
                  {(card.metadata as any).summary}
                </p>
              )}

              {/* Tags */}
              {card.tags && card.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {card.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--surface-soft)',
                        color: 'var(--foreground-muted)',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {hasMore && (
        <div className="flex justify-center mt-8">
          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
            Page {page} — showing {cards.length} of {total}
          </p>
        </div>
      )}
    </div>
  )
}
