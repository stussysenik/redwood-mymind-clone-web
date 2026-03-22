/**
 * Graph utilities — stub module
 *
 * Provides `buildGraphData` and related types used by GraphClient.
 * In a full implementation this would live server-side or be generated
 * from a GraphQL query; here it is kept minimal so Storybook and tests
 * can import GraphClient without missing-module errors.
 */

export interface GraphNode {
  id: string
  title: string | null
  imageUrl: string | null
  type: string
  tags: string[]
  color?: string
  connections?: number
}

export interface GraphLink {
  source: string
  target: string
  weight: number
  sharedTags: string[]
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface CardInput {
  id: string
  title: string | null
  imageUrl: string | null
  type: string
  tags: string[]
  metadata?: { colors?: string[] } | null
}

const TYPE_COLORS: Record<string, string> = {
  article: '#3B82F6',
  social: '#1DA1F2',
  video: '#EF4444',
  note: '#F59E0B',
  image: '#8B5CF6',
  book: '#10B981',
  movie: '#F97316',
  product: '#6B7280',
}

/**
 * Build a force-graph-compatible data structure from a list of cards.
 * Edges are drawn between cards that share at least `minWeight` tags.
 */
export function buildGraphData(cards: CardInput[], minWeight = 1): GraphData {
  const nodes: GraphNode[] = cards.map((c) => ({
    id: c.id,
    title: c.title,
    imageUrl: c.imageUrl,
    type: c.type,
    tags: c.tags,
    color: c.metadata?.colors?.[0] ?? TYPE_COLORS[c.type] ?? '#6B7280',
    connections: 0,
  }))

  const links: GraphLink[] = []
  const connectionCount: Record<string, number> = {}

  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]
      const b = cards[j]
      const shared = a.tags.filter((t) => b.tags.includes(t))
      if (shared.length >= minWeight) {
        links.push({ source: a.id, target: b.id, weight: shared.length, sharedTags: shared })
        connectionCount[a.id] = (connectionCount[a.id] ?? 0) + 1
        connectionCount[b.id] = (connectionCount[b.id] ?? 0) + 1
      }
    }
  }

  // Attach connection degree to each node so the canvas renderer can size them
  for (const node of nodes) {
    node.connections = connectionCount[node.id] ?? 0
  }

  return { nodes, links }
}
