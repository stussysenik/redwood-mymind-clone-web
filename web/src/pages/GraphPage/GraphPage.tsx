import { Metadata } from '@redwoodjs/web'

import GraphCell from 'src/components/GraphCell'

const GraphPage = () => {
  return (
    <>
      <Metadata title="Knowledge Graph" />
      <div className="px-4 sm:px-6 py-6">
        <h2 className="font-serif text-xl mb-4" style={{ color: 'var(--foreground)' }}>Knowledge Graph</h2>
        <GraphCell />
      </div>
    </>
  )
}

export default GraphPage
