/**
 * GraphListView — connection-index layout for the knowledge graph.
 *
 * Design philosophy (iA Writer × Things):
 *   - Tags lead. They define the cluster a card belongs to and why it
 *     connects to other cards. They appear before the title, not after.
 *   - No pill chrome. Tags are flat `#label` text, separated by `·`.
 *     Backgrounds and `rounded-full` badges are visual noise — removed.
 *   - Hairline borders, tight rhythm, high contrast typography.
 *   - 44 px minimum touch targets everywhere (Things standard).
 *
 * Accessibility: semantic list markup, aria-label on every interactive
 * surface, aria-live counters, aria-pressed on toggle rows.
 *
 * i18n: every visible string flows through GraphListViewMessages.
 */

import { useState, useCallback, useMemo } from 'react'
import { Rows3, ChevronLeft, ChevronRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

export interface GraphListViewMessages {
  heading: string
  statsConnected: (n: number) => string
  statsIsolated: (n: number) => string
  statsNodes: (n: number) => string
  statsLinks: (n: number) => string
  allIsolated: string
  connectionCount: (n: number) => string
  sharedVia: string
  moreConnections: (n: number) => string
  prevConnection: string
  nextConnection: string
  connectionCounter: (current: number, total: number) => string
  tapToOpen: string
  untitled: string
  noSharedTags: string
}

export const defaultMessages: GraphListViewMessages = {
  heading: 'Connection Index',
  statsConnected: (n) => `${n} connected`,
  statsIsolated: (n) => `${n} isolated`,
  statsNodes: (n) => `${n} nodes`,
  statsLinks: (n) => `${n} links`,
  allIsolated: 'Cards connect as shared tags develop.',
  connectionCount: (n) => `${n} connection${n === 1 ? '' : 's'}`,
  sharedVia: 'via',
  moreConnections: (n) => `+${n} more — open card to see all`,
  prevConnection: 'Previous connection',
  nextConnection: 'Next connection',
  connectionCounter: (c, t) => `${c} of ${t}`,
  tapToOpen: 'Tap again to open',
  untitled: 'Untitled',
  noSharedTags: 'connected card',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  messages?: Partial<GraphListViewMessages>
}

type ConnectionPreview = {
  id: string
  title: string
  type: string
  color: string
  weight: number
  sharedTags: string[]
}

// ---------------------------------------------------------------------------
// Type metadata
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// TagRow — flat editorial tag list, no pill chrome
// ---------------------------------------------------------------------------

function TagRow({
  tags,
  highlighted = false,
  prefix,
  maxVisible = 5,
}: {
  tags: string[]
  highlighted?: boolean
  prefix?: string
  maxVisible?: number
}) {
  if (tags.length === 0) return null
  const visible = tags.slice(0, maxVisible)
  const overflow = tags.length - maxVisible

  return (
    <span
      className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px] leading-snug"
      style={{ color: highlighted ? 'var(--accent-primary)' : 'var(--foreground-muted)' }}
    >
      {prefix && (
        <span style={{ opacity: 0.5, fontVariant: 'small-caps', letterSpacing: '0.06em' }}>
          {prefix}
        </span>
      )}
      {visible.map((tag, i) => (
        <span key={tag}>
          <span style={{ opacity: 0.45, userSelect: 'none' }} aria-hidden>#</span>
          <span>{tag}</span>
          {i < visible.length - 1 && (
            <span
              style={{ opacity: 0.3, marginLeft: '0.375rem', userSelect: 'none' }}
              aria-hidden
            >
              ·
            </span>
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span style={{ opacity: 0.4 }} aria-label={`and ${overflow} more tags`}>
          +{overflow}
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// ConnectionRow — tags lead, title follows
// ---------------------------------------------------------------------------

function ConnectionRow({
  conn,
  isSelected,
  onSelect,
  msg,
}: {
  conn: ConnectionPreview
  isSelected: boolean
  onSelect: () => void
  msg: GraphListViewMessages
}) {
  const tagsLabel =
    conn.sharedTags.length > 0
      ? conn.sharedTags.slice(0, 3).join(', ')
      : msg.noSharedTags
  const rowLabel = `${msg.sharedVia} ${tagsLabel}: ${conn.title}${isSelected ? `. ${msg.tapToOpen}` : ''}`

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={rowLabel}
        className="flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors active:bg-[var(--surface-hover)]"
        style={{
          minHeight: 44,
          backgroundColor: isSelected ? 'var(--surface-accent)' : 'transparent',
        }}
      >
        {/* Tags — the connection reason, flat and leading */}
        <TagRow
          tags={conn.sharedTags}
          highlighted={isSelected}
          prefix={msg.sharedVia}
          maxVisible={4}
        />

        {/* Connected card identity */}
        <div aria-hidden className="flex items-center gap-2">
          {/* Type color bar — 2px wide, not a side stripe accent, just a tiny identity mark */}
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: 2,
              backgroundColor: conn.color,
              flexShrink: 0,
            }}
          />
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug"
            style={{
              color: isSelected ? 'var(--accent-primary)' : 'var(--foreground)',
            }}
          >
            {conn.title}
          </span>
          {isSelected && (
            <ChevronRight
              className="h-3 w-3 shrink-0"
              aria-hidden
              style={{ color: 'var(--accent-primary)' }}
            />
          )}
        </div>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// NodeCard
// ---------------------------------------------------------------------------

function NodeCard({
  node,
  connections,
  showTypeBadge,
  onCardOpen,
  messages: msg,
}: {
  node: GraphListNode
  connections: ConnectionPreview[]
  showTypeBadge: boolean
  onCardOpen: (id: string) => void
  messages: GraphListViewMessages
}) {
  const [selectedConnIdx, setSelectedConnIdx] = useState<number | null>(null)
  const [imgError, setImgError] = useState(false)

  const hasConnections = connections.length > 0
  const cardLabel = node.title || msg.untitled
  const typeLabel = TYPE_LABELS[node.type] || node.type
  const initial = typeLabel[0]?.toUpperCase() ?? '?'
  const nodeTags = Array.isArray(node.tags) ? [...node.tags].slice(0, 6) : []

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

  return (
    <section
      aria-label={cardLabel}
      className="overflow-hidden"
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
      }}
    >
      {/* ── Card header ── */}
      <button
        type="button"
        onClick={() => onCardOpen(node.id)}
        aria-label={`Open ${cardLabel}${showTypeBadge ? `, ${typeLabel}` : ''}`}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors active:bg-[var(--surface-hover)] sm:px-5"
        style={{ backgroundColor: 'transparent', minHeight: 72 }}
      >
        {/* Thumbnail or type-initial avatar */}
        {node.imageUrl && !imgError ? (
          <img
            src={node.imageUrl}
            alt=""
            aria-hidden
            className="mt-0.5 h-11 w-11 shrink-0 object-cover"
            style={{
              borderRadius: 6,
              backgroundColor: node.color || 'var(--surface-soft)',
            }}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            aria-hidden
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center text-[13px] font-semibold text-white"
            style={{
              borderRadius: 6,
              background:
                node.color ||
                'linear-gradient(135deg, var(--accent-primary), #D95A3E)',
            }}
          >
            {initial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/*
           * Tags lead — they declare what cluster this card belongs to.
           * Title is secondary — it identifies the specific card within that cluster.
           */}
          {nodeTags.length > 0 && (
            <TagRow tags={nodeTags} maxVisible={6} />
          )}

          <h3
            className="mt-1 text-[14px] font-semibold leading-snug"
            style={{ color: 'var(--foreground)' }}
          >
            {cardLabel}
          </h3>

          {/* Type + connection count — tertiary, small, quiet */}
          <div className="mt-1.5 flex items-center gap-2">
            {showTypeBadge && (
              <span
                className="text-[10px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--foreground-muted)', opacity: 0.6 }}
              >
                {typeLabel}
              </span>
            )}
            {hasConnections && (
              <>
                {showTypeBadge && (
                  <span
                    aria-hidden
                    style={{ color: 'var(--foreground-muted)', opacity: 0.3 }}
                  >
                    ·
                  </span>
                )}
                <span
                  className="text-[10px]"
                  style={{ color: 'var(--foreground-muted)', opacity: 0.6 }}
                  aria-label={msg.connectionCount(connections.length)}
                >
                  {msg.connectionCount(connections.length)}
                </span>
              </>
            )}
          </div>
        </div>

        <ChevronRight
          aria-hidden
          className="mt-1 h-3.5 w-3.5 shrink-0"
          style={{ color: 'var(--foreground-muted)', opacity: 0.3 }}
        />
      </button>

      {/* ── Connection sub-list ── */}
      {hasConnections && (
        <div
          className="border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Browse bar */}
          {selectedConnIdx !== null && (
            <div
              role="navigation"
              aria-label="Browse connections"
              className="flex items-center justify-between px-4 py-2"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <button
                onClick={goToPrev}
                disabled={selectedConnIdx === 0}
                aria-label={msg.prevConnection}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium transition-all disabled:opacity-25 active:scale-95"
                style={{ color: 'var(--accent-primary)', minHeight: 44 }}
              >
                <ChevronLeft className="h-3 w-3" aria-hidden />
                prev
              </button>

              <span
                role="status"
                aria-live="polite"
                aria-atomic
                className="text-[10px] tabular-nums"
                style={{ color: 'var(--foreground-muted)' }}
              >
                {msg.connectionCounter(selectedConnIdx + 1, connections.length)}
              </span>

              <button
                onClick={goToNext}
                disabled={selectedConnIdx === connections.length - 1}
                aria-label={msg.nextConnection}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium transition-all disabled:opacity-25 active:scale-95"
                style={{ color: 'var(--accent-primary)', minHeight: 44 }}
              >
                next
                <ChevronRight className="h-3 w-3" aria-hidden />
              </button>
            </div>
          )}

          <ul aria-label={`Connections for ${cardLabel}`}>
            {connections.slice(0, 5).map((conn, idx) => (
              <ConnectionRow
                key={`${node.id}-${conn.id}`}
                conn={conn}
                isSelected={selectedConnIdx === idx}
                onSelect={() => handleConnClick(conn, idx)}
                msg={msg}
              />
            ))}

            {connections.length > 5 && (
              <li
                className="px-4 py-2 text-[11px]"
                style={{ color: 'var(--foreground-muted)', opacity: 0.55 }}
              >
                {msg.moreConnections(connections.length - 5)}
              </li>
            )}
          </ul>
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
  messages: msgOverrides,
}: GraphListViewProps) {
  const msg: GraphListViewMessages = useMemo(
    () => ({ ...defaultMessages, ...msgOverrides }),
    [msgOverrides]
  )

  const { connectionMap, sortedNodes, showTypeBadge, connectedCount, orphanCount } =
    useMemo(() => {
      const titleMap = new Map(nodes.map((n) => [n.id, n.title || msg.untitled]))
      const typeMap = new Map(nodes.map((n) => [n.id, n.type]))
      const colorMap = new Map(
        nodes.map((n) => [n.id, n.color || 'var(--accent-primary)'])
      )
      const connectionMap = new Map<string, ConnectionPreview[]>()

      for (const link of links) {
        const sharedTags = Array.isArray(link.sharedTags) ? [...link.sharedTags] : []
        const sourceList = connectionMap.get(link.source) ?? []
        const targetList = connectionMap.get(link.target) ?? []

        sourceList.push({
          id: link.target,
          title: titleMap.get(link.target) ?? msg.untitled,
          type: typeMap.get(link.target) ?? 'article',
          color: colorMap.get(link.target) ?? 'var(--accent-primary)',
          weight: link.weight,
          sharedTags,
        })
        targetList.push({
          id: link.source,
          title: titleMap.get(link.source) ?? msg.untitled,
          type: typeMap.get(link.source) ?? 'article',
          color: colorMap.get(link.source) ?? 'var(--accent-primary)',
          weight: link.weight,
          sharedTags,
        })

        connectionMap.set(link.source, sourceList)
        connectionMap.set(link.target, targetList)
      }

      const sortedNodes = [...nodes].sort((a, b) => {
        const ac = connectionMap.get(a.id)?.length ?? 0
        const bc = connectionMap.get(b.id)?.length ?? 0
        if (ac !== bc) return bc - ac
        return (a.title ?? '').localeCompare(b.title ?? '')
      })

      const uniqueTypes = new Set(nodes.map((n) => n.type))
      const showTypeBadge = uniqueTypes.size > 1
      const orphanCount = sortedNodes.filter(
        (n) => !connectionMap.get(n.id)?.length
      ).length
      const connectedCount = nodes.length - orphanCount

      return { connectionMap, sortedNodes, showTypeBadge, connectedCount, orphanCount }
    }, [nodes, links, msg.untitled])

  const allIsolated = connectedCount === 0
  const summaryText = allIsolated
    ? msg.allIsolated
    : [
        msg.statsConnected(connectedCount),
        orphanCount > 0 ? msg.statsIsolated(orphanCount) : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <div
      className="overflow-y-auto overscroll-contain"
      style={{ height: '100%' }}
    >
      <div
        className="space-y-2 px-4 pb-safe-bottom pt-16 sm:px-6 sm:pt-20"
        style={{
          paddingBottom: 'max(96px, calc(env(safe-area-inset-bottom) + 24px))',
        }}
      >
        {/* ── Header ── */}
        <header
          className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
          style={{
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <Rows3
            aria-hidden
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--accent-primary)' }}
          />

          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] uppercase tracking-[0.18em]"
              style={{ color: 'var(--foreground-muted)', opacity: 0.55 }}
            >
              {msg.heading}
            </p>
            <p
              className="mt-0.5 text-[13px]"
              style={{ color: 'var(--foreground)' }}
              role="status"
              aria-live="polite"
            >
              {summaryText}
            </p>
          </div>

          <div
            className="flex items-center gap-2 text-[11px] shrink-0"
            style={{ color: 'var(--foreground-muted)', opacity: 0.5 }}
            aria-label={`${msg.statsNodes(nodes.length)}, ${msg.statsLinks(links.length)}`}
          >
            <span aria-hidden>{msg.statsNodes(nodes.length)}</span>
            <span aria-hidden>·</span>
            <span aria-hidden>{msg.statsLinks(links.length)}</span>
          </div>
        </header>

        {/* ── Card grid: 1-col mobile, 2-col sm+ ── */}
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="list"
          aria-label={msg.heading}
        >
          {sortedNodes.map((node) => {
            const connections = [
              ...(connectionMap.get(node.id) ?? []),
            ].sort((a, b) => b.weight - a.weight)

            return (
              <div key={node.id} role="listitem">
                <NodeCard
                  node={node}
                  connections={connections}
                  showTypeBadge={showTypeBadge}
                  onCardOpen={onCardOpen}
                  messages={msg}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default GraphListView
