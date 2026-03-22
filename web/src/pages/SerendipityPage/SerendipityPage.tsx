import { Metadata } from '@redwoodjs/web'

const SerendipityPage = () => {
  return (
    <>
      <Metadata title="Serendipity" />
      <div className="px-4 sm:px-6 py-6">
        <div className="text-center mb-8">
          <h2 className="font-serif text-2xl mb-2" style={{ color: 'var(--foreground)' }}>Serendipity</h2>
          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Rediscover something from your mind</p>
        </div>
        {/* SerendipityCell will go here */}
        <div className="text-center py-20" style={{ color: 'var(--foreground-muted)' }}>
          <p className="text-sm">Random cards will appear here</p>
        </div>
      </div>
    </>
  )
}

export default SerendipityPage
