import { ArrowUpRight, Rows3 } from 'lucide-react'

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

export function GraphListView({
  nodes,
  links,
  onCardOpen,
}: GraphListViewProps) {
  const titleMap = new Map(nodes.map((node) => [node.id, node.title || 'Untitled']))
  const typeMap = new Map(nodes.map((node) => [node.id, node.type]))
  const colorMap = new Map(
    nodes.map((node) => [node.id, node.color || 'var(--accent-primary)'])
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

  const sortedNodes = [...nodes].sort((left, right) => {
    const leftConns = connectionMap.get(left.id)?.length || 0
    const rightConns = connectionMap.get(right.id)?.length || 0
    if (leftConns !== rightConns) return rightConns - leftConns
    return (left.title || '').localeCompare(right.title || '')
  })

  const uniqueTypes = new Set(nodes.map((n) => n.type))
  const showTypeBadge = uniqueTypes.size > 1

  const orphanCount = sortedNodes.filter(
    (n) => !connectionMap.get(n.id)?.length
  ).length

  return (
    <div className="space-y-4 px-4 pb-24 pt-20 sm:px-6 sm:pb-8">
      {/* Header */}
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
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
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
          <p className="mt-1 text-sm" style={{ color: 'var(--foreground)' }}>
            {orphanCount > 0 && orphanCount === nodes.length
              ? 'Cards will connect as shared tags develop.'
              : `${nodes.length - orphanCount} connected cards, ${orphanCount} unconnected.`}
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: 'var(--foreground-muted)' }}
        >
          <span>{nodes.length} nodes</span>
          <span>&middot;</span>
          <span>{links.length} links</span>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {sortedNodes.map((node) => {
          const connections = [...(connectionMap.get(node.id) || [])].sort(
            (left, right) => right.weight - left.weight
          )
          const nodeTags = Array.isArray(node.tags)
            ? [...node.tags].slice(0, 4)
            : []
          const hasConnections = connections.length > 0

          return (
            <section
              key={node.id}
              className="overflow-hidden rounded-[22px]"
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <button
                type="button"
                onClick={() => onCardOpen(node.id)}
                className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors sm:px-5"
                style={{ backgroundColor: 'transparent' }}
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
                      const initial = (TYPE_LABELS[node.type] || node.type)?.[0]?.toUpperCase() || '?'
                      const div = document.createElement('div')
                      div.className = 'mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white text-sm font-semibold'
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
                    {(TYPE_LABELS[node.type] || node.type)?.[0]?.toUpperCase() || '?'}
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
                    className="mt-2 text-base font-semibold leading-tight"
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
                <ArrowUpRight
                  className="mt-1 h-4 w-4 shrink-0"
                  style={{ color: 'var(--foreground-muted)' }}
                />
              </button>

              {/* Connections section */}
              {hasConnections && (
                <div
                  className="border-t px-4 py-3 sm:px-5"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="space-y-2.5">
                    {connections.slice(0, 4).map((connection) => (
                      <button
                        key={`${node.id}-${connection.id}`}
                        type="button"
                        onClick={() => onCardOpen(connection.id)}
                        className="flex w-full items-start gap-3 rounded-[16px] px-3 py-3 text-left transition-colors"
                        style={{ backgroundColor: 'var(--surface-elevated)' }}
                      >
                        <span
                          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: connection.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-sm font-medium"
                            style={{ color: 'var(--foreground)' }}
                          >
                            {connection.title}
                          </span>
                          <span
                            className="mt-1 block text-xs"
                            style={{ color: 'var(--foreground-muted)' }}
                          >
                            Shared: {connection.sharedTags.slice(0, 3).join(', ')}
                            {connection.sharedTags.length > 3
                              ? ` +${connection.sharedTags.length - 3}`
                              : ''}
                          </span>
                        </span>
                        <span
                          className="rounded-full px-2 py-1 text-[10px] font-medium"
                          style={{
                            backgroundColor: 'var(--surface-card)',
                            color: 'var(--foreground-muted)',
                          }}
                        >
                          {connection.weight}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default GraphListView
