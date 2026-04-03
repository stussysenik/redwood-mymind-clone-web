import { ArrowUpRight, Network, Rows3 } from 'lucide-react'

interface GraphListNode {
  id: string
  title?: string | null
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
    if (right.connections !== left.connections) {
      return right.connections - left.connections
    }

    return (left.title || '').localeCompare(right.title || '')
  })

  return (
    <div className="space-y-4 px-4 pb-24 pt-20 sm:px-6 sm:pb-8">
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
            Browse cards by connection strength and shared tags when the force map
            is too sparse or too heavy.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--foreground-muted)' }}>
          <span>{nodes.length} nodes</span>
          <span>·</span>
          <span>{links.length} links</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sortedNodes.map((node) => {
          const connections = [...(connectionMap.get(node.id) || [])].sort(
            (left, right) => right.weight - left.weight
          )
          const nodeTags = Array.isArray(node.tags) ? [...node.tags].slice(0, 4) : []
          const isOrphan = connections.length === 0

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
                className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors sm:px-5"
                style={{ backgroundColor: 'transparent' }}
              >
                <div
                  className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
                  style={{
                    background:
                      node.color ||
                      'linear-gradient(135deg, var(--accent-primary), #D95A3E)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <Network className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em]"
                      style={{
                        backgroundColor: 'var(--surface-soft)',
                        color: 'var(--foreground-muted)',
                      }}
                    >
                      {TYPE_LABELS[node.type] || node.type}
                    </span>
                    <span
                      className="rounded-full px-2 py-1 text-[10px] font-medium"
                      style={{
                        backgroundColor: isOrphan
                          ? 'var(--surface-soft)'
                          : 'var(--surface-accent)',
                        color: isOrphan
                          ? 'var(--foreground-muted)'
                          : 'var(--accent-primary)',
                      }}
                    >
                      {connections.length} connection
                      {connections.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <h3
                    className="mt-3 text-base font-semibold leading-tight"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {node.title || 'Untitled'}
                  </h3>
                  {nodeTags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {nodeTags.map((tag) => (
                        <span
                          key={`${node.id}-${tag}`}
                          className="rounded-full px-2 py-1 text-[11px]"
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

              <div
                className="border-t px-4 py-3 sm:px-5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                {connections.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                    No shared-tag edges yet. This card still stays visible so the
                    graph never disappears just because tagging is sparse.
                  </p>
                ) : (
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
                            Shared tags: {connection.sharedTags.slice(0, 3).join(', ')}
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
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default GraphListView
