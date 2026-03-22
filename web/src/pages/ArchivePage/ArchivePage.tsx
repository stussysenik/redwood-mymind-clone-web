import { Metadata } from '@redwoodjs/web'

import CardsCell from 'src/components/CardsCell'

const ArchivePage = () => {
  return (
    <>
      <Metadata title="Archive" />
      <div className="px-4 sm:px-6 py-6">
        <h2 className="font-serif text-xl mb-4" style={{ color: 'var(--foreground)' }}>Archive</h2>
        <CardsCell page={1} pageSize={25} mode="ARCHIVE" />
      </div>
    </>
  )
}

export default ArchivePage
