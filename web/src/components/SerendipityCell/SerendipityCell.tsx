import type {
  RandomCardsQuery,
  RandomCardsQueryVariables,
} from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

export const QUERY = gql`
  query RandomCardsQuery($limit: Int!) {
    randomCards(limit: $limit) {
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
  }
`

export const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div
      className="w-64 h-80 rounded-xl animate-pulse"
      style={{ backgroundColor: 'var(--shimmer-base)' }}
    />
  </div>
)

export const Empty = () => (
  <div className="text-center py-20">
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Save some cards first to discover them here
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
  randomCards,
}: CellSuccessProps<RandomCardsQuery, RandomCardsQueryVariables>) => {
  if (!randomCards.length) return <Empty />

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Featured card */}
      <div
        className="w-full max-w-sm rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {randomCards[0]?.imageUrl && (
          <img
            src={randomCards[0].imageUrl}
            alt={randomCards[0].title || ''}
            className="w-full object-cover"
            style={{ maxHeight: '300px' }}
          />
        )}
        <div className="p-4">
          <h3
            className="font-serif text-lg mb-2"
            style={{ color: 'var(--foreground)' }}
          >
            {randomCards[0]?.title || 'Untitled'}
          </h3>
          {(randomCards[0]?.metadata as any)?.summary && (
            <p
              className="text-sm mb-3"
              style={{ color: 'var(--foreground-muted)' }}
            >
              {(randomCards[0].metadata as any).summary}
            </p>
          )}
          {randomCards[0]?.tags && randomCards[0].tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {randomCards[0].tags.map((tag) => (
                <span key={tag} className="tag-pill">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Remaining cards preview */}
      {randomCards.length > 1 && (
        <div className="flex gap-3 overflow-x-auto hide-scrollbar w-full max-w-lg px-4">
          {randomCards.slice(1).map((card) => (
            <div
              key={card.id}
              className="flex-shrink-0 w-24 rounded-lg overflow-hidden card-base"
            >
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.title || ''}
                  className="w-full h-16 object-cover"
                  loading="lazy"
                />
              ) : (
                <div
                  className="w-full h-16 flex items-center justify-center"
                  style={{ backgroundColor: 'var(--surface-soft)' }}
                >
                  <span
                    className="text-[10px]"
                    style={{ color: 'var(--foreground-muted)' }}
                  >
                    {card.type}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Shuffle button */}
      <button
        className="px-6 py-2.5 rounded-full text-sm font-medium"
        style={{
          backgroundColor: 'var(--surface-accent)',
          color: 'var(--accent-primary)',
          minHeight: 'var(--touch-target-min)',
          transition: 'all var(--duration-fast) var(--ease-spring)',
        }}
        onClick={() => window.location.reload()}
      >
        Shuffle
      </button>
    </div>
  )
}
