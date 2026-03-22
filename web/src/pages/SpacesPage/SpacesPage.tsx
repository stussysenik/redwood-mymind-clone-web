import { Metadata } from '@redwoodjs/web'

const SpacesPage = () => {
  return (
    <>
      <Metadata title="Spaces" />
      <div className="px-4 sm:px-6 py-6">
        <h2 className="font-serif text-xl mb-4" style={{ color: 'var(--foreground)' }}>Spaces</h2>
        {/* SpacesCell will go here */}
        <div className="text-center py-20" style={{ color: 'var(--foreground-muted)' }}>
          <p className="text-sm">Your collections will appear here</p>
        </div>
      </div>
    </>
  )
}

export default SpacesPage
