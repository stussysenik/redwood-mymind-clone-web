import { useState, useCallback } from 'react'

import { Metadata } from '@redwoodjs/web'
import { useLocation } from '@redwoodjs/router'

import { SearchBar } from 'src/components/SearchBar/SearchBar'
import CardsCell from 'src/components/CardsCell'
import SearchCell from 'src/components/SearchCell'

const PAGE_SIZE = 25

const HomePage = () => {
  const { search } = useLocation()
  const searchParams = new URLSearchParams(search)
  const query = searchParams.get('q') ?? ''

  const [page, setPage] = useState(1)

  const handleNextPage = useCallback(() => {
    setPage((p) => p + 1)
  }, [])

  const handlePrevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1))
  }, [])

  return (
    <>
      <Metadata title="Home" description="Your saved knowledge" />
      <div className="px-4 sm:px-6 pt-4 pb-2" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SearchBar />
      </div>
      {query.trim() ? (
        <SearchCell query={query.trim()} />
      ) : (
        <CardsCell
          page={page}
          pageSize={PAGE_SIZE}
          mode="DEFAULT"
          onNextPage={handleNextPage}
          onPrevPage={handlePrevPage}
        />
      )}
    </>
  )
}

export default HomePage
