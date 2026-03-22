import type { SearchCardsQuery, SearchCardsQueryVariables } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

export const QUERY = gql`
  query SearchCardsQuery($query: String!, $type: String, $tag: String) {
    searchCards(query: $query, type: $type, tag: $tag) {
      cards {
        id
        type
        title
        content
        url
        imageUrl
        metadata
        tags
        createdAt
      }
      total
      mode
    }
  }
`

export const Loading = () => (
  <div className="px-4 sm:px-6 py-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl animate-pulse"
          style={{
            backgroundColor: 'var(--shimmer-base)',
            height: '160px',
          }}
        />
      ))}
    </div>
  </div>
)

export const Empty = () => (
  <div className="text-center py-16">
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      No results found
    </p>
  </div>
)

export const Failure = ({ error }: CellFailureProps) => (
  <div className="text-center py-10">
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Search error: {error?.message}
    </p>
  </div>
)

export const Success = ({
  searchCards,
}: CellSuccessProps<SearchCardsQuery, SearchCardsQueryVariables>) => {
  const { cards, total } = searchCards

  return (
    <div className="px-4 sm:px-6 py-6">
      <p className="text-xs mb-4" style={{ color: 'var(--foreground-muted)' }}>
        {total} results
      </p>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(var(--masonry-columns), 1fr)' }}
      >
        {cards.map((card) => (
          <div key={card.id} className="card-base cursor-pointer">
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
            <div className="p-3">
              {card.title && (
                <h3
                  className="text-sm font-medium line-clamp-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  {card.title}
                </h3>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
