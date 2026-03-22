import type { SpaceQuery, SpaceQueryVariables } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

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
        type
        title
        imageUrl
        metadata
        tags
        createdAt
      }
    }
  }
`

export const Loading = () => (
  <div className="animate-pulse space-y-4">
    <div
      className="h-8 w-48 rounded"
      style={{ backgroundColor: 'var(--shimmer-base)' }}
    />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl h-48"
          style={{ backgroundColor: 'var(--shimmer-base)' }}
        />
      ))}
    </div>
  </div>
)

export const Empty = () => (
  <div className="text-center py-20">
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Space not found
    </p>
  </div>
)

export const Failure = ({ error }: CellFailureProps) => (
  <div className="text-center py-10">
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Error: {error?.message}
    </p>
  </div>
)

export const Success = ({
  space,
}: CellSuccessProps<SpaceQuery, SpaceQueryVariables>) => {
  if (!space) return <Empty />

  return (
    <div>
      {/* Space header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2
            className="font-serif text-xl"
            style={{ color: 'var(--foreground)' }}
          >
            {space.name}
          </h2>
          {space.isSmart && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--surface-accent)',
                color: 'var(--accent-primary)',
              }}
            >
              Smart
            </span>
          )}
        </div>
        {space.query && (
          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
            Filter: {space.query}
          </p>
        )}
        <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
          {space.cardCount} cards
        </p>
      </div>

      {/* Cards grid */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(var(--masonry-columns), 1fr)' }}
      >
        {space.cards.map((card) => (
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
