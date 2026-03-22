import type {
  SimilarCardsQuery,
  SimilarCardsQueryVariables,
} from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

export const QUERY = gql`
  query SimilarCardsQuery($cardId: String, $text: String, $topK: Int) {
    similarCards(cardId: $cardId, text: $text, topK: $topK) {
      matches {
        id
        score
      }
      cards {
        id
        type
        title
        imageUrl
        metadata
        tags
      }
    }
  }
`

export const Loading = () => (
  <div className="flex gap-3 overflow-x-auto hide-scrollbar py-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <div
        key={i}
        className="flex-shrink-0 w-32 h-24 rounded-lg animate-pulse"
        style={{ backgroundColor: 'var(--shimmer-base)' }}
      />
    ))}
  </div>
)

export const Empty = () => (
  <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
    No similar cards found
  </p>
)

export const Failure = ({ error }: CellFailureProps) => (
  <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
    {error?.message}
  </p>
)

export const Success = ({
  similarCards,
}: CellSuccessProps<SimilarCardsQuery, SimilarCardsQueryVariables>) => {
  if (!similarCards.cards.length) return <Empty />

  return (
    <div className="flex gap-3 overflow-x-auto hide-scrollbar py-2">
      {similarCards.cards.map((card) => (
        <div
          key={card.id}
          className="flex-shrink-0 w-32 rounded-lg overflow-hidden cursor-pointer card-base"
        >
          {card.imageUrl && (
            <img
              src={card.imageUrl}
              alt={card.title || ''}
              className="w-full h-20 object-cover"
              loading="lazy"
            />
          )}
          <div className="p-1.5">
            <p
              className="text-[10px] line-clamp-2"
              style={{ color: 'var(--foreground)' }}
            >
              {card.title || 'Untitled'}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
