import type { GraphDataQuery, GraphDataQueryVariables } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

import { GraphClient } from 'src/components/GraphClient/GraphClient'

export const QUERY = gql`
  query GraphDataQuery($spaceId: String, $tag: String, $minWeight: Int) {
    graphData(spaceId: $spaceId, tag: $tag, minWeight: $minWeight) {
      nodes {
        id
        title
        imageUrl
        type
        tags
        colors
        connections
      }
      links {
        source
        target
        sharedTags
        weight
      }
    }
  }
`

export const Loading = () => (
  <div
    className="rounded-xl flex items-center justify-center animate-pulse"
    style={{
      height: 'calc(100vh - var(--header-height) - 120px)',
      minHeight: '400px',
      backgroundColor: 'var(--shimmer-base)',
    }}
  >
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Loading graph...
    </p>
  </div>
)

export const Empty = () => (
  <div
    className="rounded-xl flex items-center justify-center"
    style={{
      height: 'calc(100vh - var(--header-height) - 120px)',
      minHeight: '400px',
      backgroundColor: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
    }}
  >
    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
      Not enough connected cards to display a graph
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
  graphData,
}: CellSuccessProps<GraphDataQuery, GraphDataQueryVariables>) => {
  const { nodes, links } = graphData

  if (nodes.length === 0) return <Empty />

  return (
    <div
      className="rounded-xl overflow-hidden relative"
      style={{
        height: 'calc(100vh - var(--header-height) - 120px)',
        minHeight: '70vh',
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
      }}
    >
      <GraphClient nodes={nodes} links={links} />
    </div>
  )
}
