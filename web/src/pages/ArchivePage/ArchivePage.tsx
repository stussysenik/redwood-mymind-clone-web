import { Metadata } from '@redwoodjs/web'

import { useLocation } from '@redwoodjs/router'

import CardsCell from 'src/components/CardsCell'
import { SearchBar } from 'src/components/SearchBar/SearchBar'
import SearchCell from 'src/components/SearchCell'

const ArchivePage = () => {
  const { search } = useLocation()
  const searchParams = new URLSearchParams(search)
  const query = searchParams.get('q') ?? ''

  return (
    <>
      <Metadata title="Archive" />
      <div className="px-3 sm:px-6 pt-3 sm:pt-4 pb-1 sm:pb-2" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 className="font-display text-xl mb-4 px-1" style={{ color: 'var(--foreground)' }}>Archive</h2>
        <SearchBar mode="ARCHIVE" />
      </div>
      {query.trim() ? (
        <SearchCell query={query.trim()} mode="ARCHIVE" />
      ) : (
        <CardsCell page={1} pageSize={25} mode="ARCHIVE" />
      )}
    </>
  )
}

export default ArchivePage
