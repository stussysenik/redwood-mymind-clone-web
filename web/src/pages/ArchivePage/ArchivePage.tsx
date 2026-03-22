import { Metadata } from '@redwoodjs/web'

const ArchivePage = () => {
  return (
    <>
      <Metadata title="Archive" />
      <div className="px-4 sm:px-6 py-6">
        <h2 className="font-serif text-xl mb-4" style={{ color: 'var(--foreground)' }}>Archive</h2>
        {/* CardsCell with mode: ARCHIVE will go here */}
        <div className="text-center py-20" style={{ color: 'var(--foreground-muted)' }}>
          <p className="text-sm">Archived cards will appear here</p>
        </div>
      </div>
    </>
  )
}

export default ArchivePage
