import type { SpacesQuery } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

import { ArrowRight, Sparkles } from 'lucide-react'
import { Link, routes } from '@redwoodjs/router'

export const QUERY = gql`
  query SpacesQuery {
    spaces {
      id
      name
      query
      isSmart
      cardCount
      cards {
        id
        imageUrl
      }
    }
  }
`

export const Loading = () => (
  <div className="space-y-3">
    {Array.from({ length: 4 }).map((_, i) => (
      <div
        key={i}
        className="h-16 animate-pulse rounded-2xl"
        style={{ backgroundColor: 'var(--shimmer-base)' }}
      />
    ))}
  </div>
)

export const Empty = () => (
  <div
    className="rounded-2xl px-5 py-12 text-center"
    style={{
      backgroundColor: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
    }}
  >
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-accent)]">
      <Sparkles className="h-5 w-5 text-[var(--accent-primary)]" />
    </div>
    <p
      className="mb-1 font-display text-base"
      style={{ color: 'var(--foreground)' }}
    >
      No spaces yet
    </p>
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Create one to start organizing your library.
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
    <div className="space-y-2">
      {spaces.map((space) => {
        const previews = (space.cards ?? [])
          .filter((c) => c.imageUrl)
          .slice(0, 4)
        const slug = space.name.toLowerCase().replace(/\s+/g, '-')

        return (
          <Link
            key={space.id}
            to={routes.space({ id: space.id })}
            className="group flex items-center gap-3 rounded-2xl px-3.5 py-3 transition-all hover:-translate-y-0.5 active:scale-[0.99]"
            style={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {/* Preview thumbnails */}
            <div className="flex shrink-0 -space-x-2">
              {previews.length > 0 ? (
                previews.map((card, i) => (
                  <div
                    key={card.id}
                    className="h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-2 ring-[var(--surface-card)]"
                    style={{
                      zIndex: previews.length - i,
                    }}
                  >
                    <img
                      src={card.imageUrl!}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))
              ) : (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: 'var(--surface-soft)',
                    color: 'var(--foreground-muted)',
                  }}
                >
                  <span className="text-xs font-mono">/</span>
                </div>
              )}
            </div>

            {/* URL-style path + count */}
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-mono text-[13px]">
                <span style={{ color: 'var(--foreground-muted)' }}>
                  /
                </span>
                <span
                  className="font-medium"
                  style={{ color: 'var(--foreground)' }}
                >
                  {slug}
                </span>
              </h3>
              <span
                className="mt-0.5 block font-mono text-[11px] tabular-nums"
                style={{ color: 'var(--foreground-muted)' }}
              >
                {new Intl.NumberFormat().format(space.cardCount)} card{space.cardCount !== 1 ? 's' : ''}
                {space.query && (
                  <span style={{ opacity: 0.5 }}>{' '}· #{space.query}</span>
                )}
              </span>
            </div>

            <ArrowRight
              className="h-3.5 w-3.5 shrink-0 opacity-0 transition-all group-hover:opacity-60 group-hover:translate-x-0.5"
              style={{ color: 'var(--foreground-muted)' }}
            />
          </Link>
        )
      })}
    </div>
  )
}
