import { useCallback, useEffect, useMemo, useState } from 'react'

import { Metadata } from '@redwoodjs/web'
import { useMutation, useQuery } from '@redwoodjs/web'
import { Link, routes } from '@redwoodjs/router'

import ReviewCard, {
  type ReviewCardData,
  type ReviewResolution,
} from 'src/components/ReviewCard/ReviewCard'
import 'src/components/ReviewCard/ReviewCard.css'

const PENDING_QUERY = gql`
  query PendingEnrichmentReviewItems($first: Int, $after: String) {
    pendingEnrichmentReviewItems(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          cardId
          kind
          proposedValue
          currentValue
          confidence
          critique
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`

const RESOLVE_MUTATION = gql`
  mutation ResolveEnrichmentReviewItem(
    $id: String!
    $resolution: EnrichmentReviewResolution!
    $editedValue: String
  ) {
    resolveEnrichmentReviewItem(
      id: $id
      resolution: $resolution
      editedValue: $editedValue
    ) {
      id
      resolvedAt
      resolution
    }
  }
`

type Edge = {
  cursor: string
  node: ReviewCardData & { cardId: string; createdAt: string }
}

const MESSAGES = {
  title: 'Review',
  loading: 'Loading review queue…',
  error: (err: string) => `Couldn't load review queue. ${err}`,
  emptyLine: (n: number) => `All caught up. ${n} cards improved this week.`,
  emptyLinkHome: '← back to home',
  helpOpen: 'Keyboard shortcuts',
  helpCloseLink: 'close',
  helpHeading: 'Keyboard shortcuts',
}

const ReviewPage = () => {
  const [position, setPosition] = useState(0)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [srMessage, setSrMessage] = useState('')
  const [resolvedThisSession, setResolvedThisSession] = useState(0)

  const { data, loading, error, refetch } = useQuery<{
    pendingEnrichmentReviewItems: {
      edges: Edge[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      totalCount: number
    }
  }>(PENDING_QUERY, {
    variables: { first: 10, after: null },
    fetchPolicy: 'cache-and-network',
  })

  const [resolve] = useMutation(RESOLVE_MUTATION)

  const edges = data?.pendingEnrichmentReviewItems?.edges ?? []
  const totalCount = data?.pendingEnrichmentReviewItems?.totalCount ?? 0
  const current = edges[position]?.node

  // Announce resolutions politely for screen readers.
  const announce = useCallback((msg: string) => {
    setSrMessage(msg)
  }, [])

  // Keyboard layer — `?` toggles :target help overlay by navigating to a hash.
  // Everything else flows through ReviewCard, which owns action keys.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        if (window.location.hash === '#keyboard-help') {
          history.replaceState(null, '', window.location.pathname)
        } else {
          window.location.hash = 'keyboard-help'
        }
        return
      }
      if (e.key.toLowerCase() === 'j') {
        setPosition((p) => Math.min(p + 1, Math.max(edges.length - 1, 0)))
      } else if (e.key.toLowerCase() === 'k') {
        setPosition((p) => Math.max(p - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edges.length])

  const handleResolve = useCallback(
    async (resolution: ReviewResolution, editedValue?: string) => {
      if (!current) return
      setResolvingId(current.id)
      try {
        await resolve({
          variables: {
            id: current.id,
            resolution,
            editedValue: resolution === 'edit' ? editedValue : null,
          },
          // Optimistic update — drop the current item from the cached edges
          // so the next one surfaces immediately.
          update: (cache) => {
            cache.modify({
              fields: {
                pendingEnrichmentReviewItems(existing: any) {
                  if (!existing?.edges) return existing
                  return {
                    ...existing,
                    edges: existing.edges.filter(
                      (e: any) => e.node.__ref !== `EnrichmentReviewItem:${current.id}` &&
                        e.node.id !== current.id,
                    ),
                    totalCount: Math.max(0, (existing.totalCount ?? 0) - 1),
                  }
                },
              },
            })
          },
        })
        setResolvedThisSession((n) => n + 1)
      } catch (e) {
        // Rollback happens implicitly because the mutation failed and cache
        // modify only runs on success. Refetch to make sure.
        await refetch()
      } finally {
        setResolvingId(null)
      }
    },
    [current, resolve, refetch],
  )

  // When the edges list shrinks below the current position (e.g. after
  // optimistic removal), clamp to the new end.
  useEffect(() => {
    if (position >= edges.length && edges.length > 0) {
      setPosition(edges.length - 1)
    }
    if (edges.length === 0) {
      setPosition(0)
    }
  }, [edges.length, position])

  // If we've walked off the current page, fetch the next.
  useEffect(() => {
    const pageInfo = data?.pendingEnrichmentReviewItems?.pageInfo
    if (!pageInfo?.hasNextPage) return
    if (edges.length - position <= 2) {
      refetch({ first: 10, after: pageInfo.endCursor })
    }
  }, [data, edges.length, position, refetch])

  const isEmpty = !loading && !error && edges.length === 0

  return (
    <>
      <Metadata title={MESSAGES.title} />

      <div
        style={{
          maxWidth: 72 * 8,
          margin: '0 auto',
          padding: 'var(--space-phi-xl, 26px) var(--space-phi-lg, 16px)',
        }}
      >
        {loading && !data ? <p>{MESSAGES.loading}</p> : null}
        {error ? <p role="alert">{MESSAGES.error(error.message)}</p> : null}

        {isEmpty ? <EmptyState count={resolvedThisSession} /> : null}

        {current ? (
          <div
            className="rc-slot"
            data-resolving={resolvingId === current.id ? 'true' : 'false'}
            data-entering="true"
            key={current.id}
          >
            <ReviewCard
              item={current}
              position={position + 1}
              total={totalCount || edges.length}
              onResolve={handleResolve}
              announce={announce}
            />
          </div>
        ) : null}

        {/* Polite screen-reader announcement region. */}
        <div
          className="rc-sr"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {srMessage}
        </div>
      </div>

      <KeyboardHelp />
    </>
  )
}

function EmptyState({ count }: { count: number }) {
  return (
    <section className="rc-empty" aria-labelledby="rc-empty-line">
      <svg
        className="rc-empty__diamond"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <path d="M32 4 L60 32 L32 60 L4 32 Z" />
        <path d="M32 4 L32 60" />
        <path d="M4 32 L60 32" />
      </svg>
      <p id="rc-empty-line" className="rc-empty__line">
        {count > 0
          ? `All caught up. ${count} cards improved this session.`
          : 'All caught up.'}
      </p>
      <Link to={routes.home()} className="rc-empty__link">
        ← back to home
      </Link>
    </section>
  )
}

function KeyboardHelp() {
  return (
    <div id="keyboard-help" className="rc-help" aria-label="Keyboard shortcuts">
      <div className="rc-help__panel" role="dialog" aria-modal="false">
        <h2>Keyboard shortcuts</h2>
        <dl>
          <dt>a</dt>
          <dd>accept</dd>
          <dt>r</dt>
          <dd>reject</dd>
          <dt>e</dt>
          <dd>edit</dd>
          <dt>s</dt>
          <dd>skip</dd>
          <dt>j / k</dt>
          <dd>next / previous</dd>
          <dt>?</dt>
          <dd>toggle this help</dd>
        </dl>
        <a href="#" className="rc-help__close">
          close
        </a>
      </div>
    </div>
  )
}

export default ReviewPage
