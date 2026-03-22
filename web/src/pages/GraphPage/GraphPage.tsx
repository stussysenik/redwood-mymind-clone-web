import { Metadata } from '@redwoodjs/web'

const GraphPage = () => {
  return (
    <>
      <Metadata title="Knowledge Graph" />
      <div className="px-4 sm:px-6 py-6">
        <h2 className="font-serif text-xl mb-4" style={{ color: 'var(--foreground)' }}>Knowledge Graph</h2>
        {/* GraphCell will go here */}
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
            Knowledge graph visualization will appear here
          </p>
        </div>
      </div>
    </>
  )
}

export default GraphPage
