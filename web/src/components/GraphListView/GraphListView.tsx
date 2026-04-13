/**
 * Graph List View — dense card index when the force-graph renderer isn't available
 * or the user prefers a list layout.
 *
 * Mobile: single column, generous touch targets, safe-area padding.
 * Desktop: 2-column grid.
 *
 * Connection rows: same browsing UX as GraphDetailPanel — tap to select,
 * tap again to open. No accidental navigation.
 */

import { useState, useCallback, useMemo } from 'react'
import { Rows3, ChevronLeft, ChevronRight } from 'lucide-react'

interface GraphListNode {
  id: string
  title?: string | null
  imageUrl?: string | null
  type: string
  tags: readonly string[] | string[]
  connections: number
  color?: string
}

interface GraphListLink {
  source: string
  target: string
  sharedTags: readonly string[] | string[]
  weight: number
}

interface GraphListViewProps {
  nodes: readonly GraphListNode[]
  links: readonly GraphListLink[]
  onCardOpen: (cardId: string) => void
}

type ConnectionPreview = {
  id: string
  title: string
  type: string
  color: string
  weight: number
  sharedTags: string[]
}

const TYPE_LABELS: Record<string, string> = {
  article: 'Article',
  social: 'Social',
  video: 'Video',
  note: 'Note',
  image: 'Image',
  book: 'Book',
  movie: 'Movie',
  product: 'Product',
  website: 'Website',
  audio: 'Audio',
}

const TYPE_INITIALS: Record<string, string> = {
  article: 'A', social: 'S', video: 'V', note: 'N',
  image: 'I', book: 'B', movie: 'M', product: 'P',
  website: 'W', audio: '♪',
}

// ---------------------------------------------------------------------------
// NodeCard — a single node with its connection sub-list
// ---------------------------------------------------------------------------

function NodeCard({
  node,
  connections,
  showTypeBadge,
  onCardOpen,
}: {
  node: GraphListNode
  connections: ConnectionPreview[]
  showTypeBadge: boolean
  onCardOpen: (id: string) => void
}) {
  const [selectedConnIdx, setSelectedConnIdx] = useState<number | null>(null)
  const hasConnections = connections.length > 0

  const handleConnClick = useCallback(
    (conn: ConnectionPreview, idx: number) => {
      if (selectedConnIdx === idx) {
        onCardOpen(conn.id)
        setSelectedConnIdx(null)
      } else {
        setSelectedConnIdx(idx)
      }
    },
    [selectedConnIdx, onCardOpen]
  )

  const goToPrev = useCallback(() => {
    setSelectedConnIdx((i) => (i !== null ? Math.max(0, i - 1) : 0))
  }, [])

  const goToNext = useCallback(() => {
    setSelectedConnIdx((i) =>
      i !== null ? Math.min(connections.length - 1, i + 1) : 0
    )
  }, [connections.length])

  const nodeTags = Array.isArray(node.tags) ? [...node.tags].slice(0, 4) : []
  const initial = (TYPE_LABELS[node.type] || node.type)?.[0]?.toUpperCase() || '?'

  return (
    <section
      className="overflow-hidden rounded-[22px]"
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Node header — tap to open this card */}
      <button
        type="button"
        onClick={() => onCardOpen(node.id)}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors active:bg-[var(--surface-hover)] sm:px-5"
        style={{ backgroundColor: 'transparent', minHeight: 72 }}
      >
        {/* Thumbnail or type-initial circle */}
        {node.imageUrl ? (
          <img
            src={node.imageUrl}
            alt=""
            className="mt-0.5 h-12 w-12 shrink-0 rounded-xl object-cover"
            style={{ backgroundColor: node.color || 'var(--surface-soft)' }}
            loading="lazy"
            onError={(e) => {
              const el = e.currentTarget
              const parent = el.parentElement!
              const div = document.createElement('div')
              div.className =
                'mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white text-sm font-semibold'
              div.style.background = node.color || 'var(--accent-primary)'
              div.textContent = initial
              parent.replaceChild(div, el)
            }}
          />
        ) : (
          <div
            className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
            style={{
              background:
                node.color ||
                'linear-gradient(135deg, var(--accent-primary), #D95A3E)',
            }}
          >
            {initial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {showTypeBadge && (
              <span
                className="rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em]"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  color: 'var(--foreground-muted)',
                }}
              >
                {TYPE_LABELS[node.type] || node.type}
              </span>
            )}
            {hasConnections && (
              <span
                className="rounded-full px-2 py-1 text-[10px] font-medium"
                style={{
                  backgroundColor: 'var(--surface-accent)',
                  color: 'var(--accent-primary)',
                }}
              >
                {connections.length} connection
                {connections.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <h3
            className="mt-1.5 text-base font-semibold leading-tight"
            style={{ color: 'var(--foreground)' }}
          >
            {node.title || 'Untitled'}
          </h3>
          {nodeTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nodeTags.map((tag) => (
                <span
                  key={`${node.id}-${tag}`}
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{
                    backgroundColor: 'var(--surface-elevated)',
                    color: 'var(--foreground-muted)',
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Chevron affordance */}
        <div
          className="mt-1 h-5 w-5 shrink-0 flex items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--surface-soft)' }}
        >
          <ChevronRight
            className="h-3 w-3"
            style={{ color: 'var(--foreground-muted)' }}
          />
        </div>
      </button>

      {/* Connection sub-list */}
      {hasConnections && (
        <div
          className="border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Browse bar — visible only when a connection is selected */}
          {selectedConnIdx !== null && (
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <button
                onClick={goToPrev}
                disabled={selectedConnIdx === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-25 active:scale-95"
                style={{
                  color: 'var(--accent-primary)',
                  backgroundColor: 'var(--surface-accent)',
                }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                prev
              </button>
              <span
                className="text-[10px] font-medium tabular-nums"
                style={{ color: 'var(--foreground-muted)' }}
              >
                {selectedConnIdx + 1} / {connections.length}
              </span>
              <button
                onClick={goToNext}
                disabled={selectedConnIdx === connections.length - 1}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-25 active:scale-95"
                style={{
                  color: 'var(--accent-primary)',
                  backgroundColor: 'var(--surface-accent)',
                }}
              >
                next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="px-3 py-2 space-y-1.5">
            {connections.slice(0, 5).map((conn, idx) => {
              const isSelected = selectedConnIdx === idx
              return (
                <button
                  key={`${node.id}-${conn.id}`}
                  type="button"
                  onClick={() => handleConnClick(conn, idx)}
                  className="flex w-full items-start gap-3 rounded-[14px] px-3 py-3 text-left transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--surface-accent)'
                      : 'var(--surface-elevated)',
                    minHeight: 44,
                  }}
                >
                  {/* Color dot with type initial */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold mt-0.5"
                    style={{
                      width: 20,
                      height: 20,
                      backgroundColor: conn.color,
                      fontSize: 8,
                    }}
                  >
                    {TYPE_INITIALS[conn.type] || '?'}
                  </div>

                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm font-medium"
                      style={{
                        color: isSelected
                          ? 'var(--accent-primary)'
                          : 'var(--foreground)',
                      }}
                    >
                      {conn.title}
                    </span>
                    {conn.sharedTags.length > 0 && (
                      <span
                        className="mt-0.5 block text-xs truncate"
                        style={{ color: 'var(--foreground-muted)' }}
                      >
                        {conn.sharedTags.slice(0, 3).join(', ')}
                        {conn.sharedTags.length > 3
                          ? ` +${conn.sharedTags.length - 3}`
                          : ''}
                      </span>
                    )}
                    {isSelected && (
                      <span
                        className="mt-1 block text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        Tap again to open
                      </span>
                    )}
                  </span>

                  <span
                    className="self-center rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0"
                    style={{
                      backgroundColor: 'var(--surface-card)',
                      color: 'var(--foreground-muted)',
                    }}
                  >
                    {conn.weight}
                  </span>
                </button>
              )
            })}
            {connections.length > 5 && (
              <p
                className="px-3 pb-1 text-[11px] text-center"
                style={{ color: 'var(--foreground-muted)' }}
              >
                +{connections.length - 5} more connections — open card to see all
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// GraphListView
// ---------------------------------------------------------------------------

export function GraphListView({
  nodes,
  links,
  onCardOpen,
}: GraphListViewProps) {
  // All derived state memoized on [nodes, links] — not rebuilt on every parent re-render
  const { connectionMap, sortedNodes, showTypeBadge, orphanCount } = useMemo(() => {
    const titleMap = new Map(nodes.map((n) => [n.id, n.title || 'Untitled']))
    const typeMap = new Map(nodes.map((n) => [n.id, n.type]))
    const colorMap = new Map(
      nodes.map((n) => [n.id, n.color || 'var(--accent-primary)'])
    )
    const connectionMap = new Map<string, ConnectionPreview[]>()

    for (const link of links) {
      const sharedTags = Array.isArray(link.sharedTags) ? [...link.sharedTags] : []
      const sourceList = connectionMap.get(link.source) || []
      const targetList = connectionMap.get(link.target) || []

      sourceList.push({
        id: link.target,
        title: titleMap.get(link.target) || 'Untitled',
        type: typeMap.get(link.target) || 'article',
        color: colorMap.get(link.target) || 'var(--accent-primary)',
        weight: link.weight,
        sharedTags,
      })
      targetList.push({
        id: link.source,
        title: titleMap.get(link.source) || 'Untitled',
        type: typeMap.get(link.source) || 'article',
        color: colorMap.get(link.source) || 'var(--accent-primary)',
        weight: link.weight,
        sharedTags,
      })

      connectionMap.set(link.source, sourceList)
      connectionMap.set(link.target, targetList)
    }

    const sortedNodes = [...nodes].sort((a, b) => {
      const ac = connectionMap.get(a.id)?.length || 0
      const bc = connectionMap.get(b.id)?.length || 0
      if (ac !== bc) return bc - ac
      return (a.title || '').localeCompare(b.title || '')
    })

    const uniqueTypes = new Set(nodes.map((n) => n.type))
    const showTypeBadge = uniqueTypes.size > 1
    const orphanCount = sortedNodes.filter(
      (n) => !connectionMap.get(n.id)?.length
    ).length

    return { connectionMap, sortedNodes, showTypeBadge, orphanCount }
  }, [nodes, links])

  return (
    <div
      className="overflow-y-auto overscroll-contain"
      style={{ height: '100%' }}
    >
      <div className="space-y-3 px-4 pb-safe-bottom pt-16 sm:px-6 sm:pt-20"
        style={{ paddingBottom: 'max(96px, calc(env(safe-area-inset-bottom) + 24px))' }}
      >
        {/* Header summary */}
        <div
          className="flex flex-wrap items-center gap-3 rounded-[20px] px-4 py-3 sm:px-5"
          style={{
            background:
              'linear-gradient(135deg, rgba(255, 107, 74, 0.08), rgba(43, 87, 154, 0.05))',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-2xl shrink-0"
            style={{ backgroundColor: 'var(--surface-card)' }}
          >
            <Rows3 className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] uppercase tracking-[0.18em]"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Connection Index
            </p>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--foreground)' }}>
              {orphanCount > 0 && orphanCount === nodes.length
                ? 'Cards will connect as shared tags develop.'
                : `${nodes.length - orphanCount} connected · ${orphanCount} unconnected`}
            </p>
          </div>
          <div
            className="flex items-center gap-2 text-xs shrink-0"
            style={{ color: 'var(--foreground-muted)' }}
          >
            <span>{nodes.length} nodes</span>
            <span aria-hidden>·</span>
            <span>{links.length} links</span>
          </div>
        </div>

        {/* Card grid — 1-col mobile, 2-col sm+ */}
        <div className="grid gap-3 sm:grid-cols-2">
          {sortedNodes.map((node) => {
            const connections = [
              ...(connectionMap.get(node.id) || []),
            ].sort((a, b) => b.weight - a.weight)

            return (
              <NodeCard
                key={node.id}
                node={node}
                connections={connections}
                showTypeBadge={showTypeBadge}
                onCardOpen={onCardOpen}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default GraphListView
