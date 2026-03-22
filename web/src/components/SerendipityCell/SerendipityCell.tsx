import type {
  RandomCardsQuery,
  RandomCardsQueryVariables,
} from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

import { SerendipityClient } from 'src/components/SerendipityClient/SerendipityClient'
import type { Card, CardType, CardMetadata } from 'src/lib/types'

export const QUERY = gql`
  query RandomCardsQuery($limit: Int!) {
    randomCards(limit: $limit) {
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

  // Convert GraphQL results to the Card type expected by SerendipityClient
  const cards: Card[] = randomCards.map((gqlCard) => ({
    id: gqlCard.id,
    userId: gqlCard.userId,
    type: gqlCard.type as CardType,
    title: gqlCard.title ?? null,
    content: gqlCard.content ?? null,
    url: gqlCard.url ?? null,
    imageUrl: gqlCard.imageUrl ?? null,
    metadata: (gqlCard.metadata ?? {}) as CardMetadata,
    tags: gqlCard.tags ?? [],
    createdAt: gqlCard.createdAt,
    updatedAt: gqlCard.updatedAt,
    deletedAt: gqlCard.deletedAt ?? null,
    archivedAt: gqlCard.archivedAt ?? null,
  }))

  return <SerendipityClient initialCards={cards} />
}
