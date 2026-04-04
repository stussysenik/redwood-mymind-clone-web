import type { SpacesQuery } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

import { ArrowRight, Hash, Layers, Sparkles } from 'lucide-react'
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
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="h-40 animate-pulse rounded-3xl"
        style={{ backgroundColor: 'var(--shimmer-base)' }}
      />
    ))}
  </div>
)

export const Empty = () => (
  <div
    className="rounded-[28px] px-6 py-16 text-center"
    style={{
      background:
        'linear-gradient(135deg, color-mix(in srgb, var(--surface-elevated) 92%, white 8%) 0%, color-mix(in srgb, var(--surface-soft) 90%, white 10%) 100%)',
      border: '1px solid var(--border-subtle)',
    }}
  >
    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-accent)]">
      <Sparkles className="h-6 w-6 text-[var(--accent-primary)]" />
    </div>
    <p
      className="mb-2 font-display text-lg"
      style={{ color: 'var(--foreground)' }}
    >
      No spaces yet
    </p>
    <p
      className="text-sm mb-1"
      style={{ color: 'var(--foreground-muted)' }}
    >
      Spaces let you organize cards into collections.
    </p>
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Create a space manually using the button above, or use a suggested space
      generated from your most-used tags.
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {spaces.map((space) => (
        <Link
          key={space.id}
          to={routes.space({ id: space.id })}
          className="group block rounded-[28px] p-5 transition-all hover:-translate-y-0.5"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--surface-card) 92%, white 8%) 0%, color-mix(in srgb, var(--surface-elevated) 94%, white 6%) 100%)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: space.isSmart
                  ? 'var(--surface-accent)'
                  : 'var(--surface-soft)',
                color: 'var(--accent-primary)',
              }}
            >
              {space.isSmart ? (
                <Hash className="h-5 w-5" />
              ) : (
                <Layers className="h-5 w-5" />
              )}
            </div>
            <div className="flex items-center gap-2">
              {space.isSmart && (
                <span
                  className="rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em]"
                  style={{
                    backgroundColor: 'var(--surface-accent)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  Smart
                </span>
              )}
              <span
                className="rounded-full px-2.5 py-1 text-xs"
                style={{
                  backgroundColor: 'var(--surface-elevated)',
                  color: 'var(--foreground-muted)',
                }}
              >
                {new Intl.NumberFormat().format(space.cardCount)} cards
              </span>
            </div>
          </div>
          <div className="space-y-3">
            <h3
              className="text-lg font-medium leading-tight"
              style={{ color: 'var(--foreground)' }}
            >
              {space.name}
            </h3>
            <p
              className="min-h-[40px] text-sm leading-relaxed"
              style={{ color: 'var(--foreground-muted)' }}
            >
              {space.query
                ? `Tracks cards retraceable through #${space.query}.`
                : 'A manual collection for ideas you want to revisit fast.'}
            </p>
          </div>
          <div className="mt-5 flex items-center justify-between">
            {space.query ? (
              <span
                className="rounded-full px-2.5 py-1 text-xs"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  color: 'var(--foreground-muted)',
                }}
              >
                #{space.query}
              </span>
            ) : (
              <span
                className="text-xs uppercase tracking-[0.18em]"
                style={{ color: 'var(--foreground-muted)' }}
              >
                Manual space
              </span>
            )}
            <ArrowRight className="h-4 w-4 text-[var(--foreground-muted)] transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      ))}
    </div>
  )
}
