import type { SpacesQuery } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

import { Link, routes } from '@redwoodjs/router'

export const QUERY = gql`
  query SpacesQuery {
    spaces {
      id
      name
      query
      isSmart
      cardCount
    }
  }
`

export const Loading = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="rounded-xl animate-pulse h-28"
        style={{ backgroundColor: 'var(--shimmer-base)' }}
      />
    ))}
  </div>
)

export const Empty = () => (
  <div className="text-center py-20">
    <p
      className="font-serif text-lg mb-2"
      style={{ color: 'var(--foreground)' }}
    >
      No spaces yet
    </p>
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Create a space to organize your cards into collections
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

export const Success = ({ spaces }: CellSuccessProps<SpacesQuery>) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {spaces.map((space) => (
        <Link
          key={space.id}
          to={routes.space({ id: space.id })}
          className="block rounded-xl p-4 transition-all hover-lift"
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            borderLeft: `4px solid var(--accent-primary)`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <h3
              className="font-medium text-sm"
              style={{ color: 'var(--foreground)' }}
            >
              {space.name}
            </h3>
            {space.isSmart && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full"
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
            <p
              className="text-xs line-clamp-2 mb-2"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Filter: {space.query}
            </p>
          )}
          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
            {space.cardCount} cards
          </p>
        </Link>
      ))}
    </div>
  )
}
