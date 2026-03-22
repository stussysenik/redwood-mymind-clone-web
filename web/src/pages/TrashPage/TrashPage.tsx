import { Metadata } from '@redwoodjs/web'

const TrashPage = () => {
  return (
    <>
      <Metadata title="Trash" />
      <div className="px-4 sm:px-6 py-6">
        <h2 className="font-serif text-xl mb-4" style={{ color: 'var(--foreground)' }}>Trash</h2>
        {/* CardsCell with mode: TRASH will go here */}
        <div className="text-center py-20" style={{ color: 'var(--foreground-muted)' }}>
          <p className="text-sm">Deleted cards will appear here</p>
        </div>
      </div>
    </>
  )
}

export default TrashPage
