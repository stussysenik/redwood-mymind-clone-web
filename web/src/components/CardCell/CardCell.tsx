import type { CardQuery, CardQueryVariables } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

import { getBrowserImageUrl } from 'src/lib/imageProxy'

export const QUERY = gql`
  query CardQuery($id: String!) {
    card(id: $id) {
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
  <div
    className="animate-pulse rounded-xl p-6"
    style={{
      backgroundColor: 'var(--shimmer-base)',
      height: '400px',
    }}
  />
)

export const Empty = () => (
  <div className="text-center py-10">
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Card not found
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
  card,
}: CellSuccessProps<CardQuery, CardQueryVariables>) => {
  if (!card) return <Empty />

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
      }}
    >
      {card.imageUrl && (
        <img
          src={getBrowserImageUrl(card.imageUrl) || card.imageUrl}
          alt={card.title || ''}
          className="w-full object-cover"
          style={{ maxHeight: '400px' }}
        />
      )}
      <div className="p-6">
        <h2
          className="font-serif text-xl mb-2"
          style={{ color: 'var(--foreground)' }}
        >
          {card.title || 'Untitled'}
        </h2>
        {(card.metadata as any)?.summary && (
          <p
            className="text-sm mb-4"
            style={{ color: 'var(--foreground-muted)' }}
          >
            {(card.metadata as any).summary}
          </p>
        )}
        {card.tags && card.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {card.tags.map((tag) => (
              <span key={tag} className="tag-pill">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
