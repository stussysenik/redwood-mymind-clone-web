import { Metadata } from '@redwoodjs/web'
import { useLocation } from '@redwoodjs/router'

import { SearchBar } from 'src/components/SearchBar/SearchBar'
import CardsCell from 'src/components/CardsCell'
import SearchCell from 'src/components/SearchCell'

const HomePage = () => {
  const { search } = useLocation()
  const searchParams = new URLSearchParams(search)
  const query = searchParams.get('q') ?? ''

  return (
    <>
      <Metadata title="Home" description="Your saved knowledge" />
      <div className="px-4 sm:px-6 pt-4 pb-2" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SearchBar />
      </div>
      {query.trim() ? (
        <SearchCell query={query.trim()} />
      ) : (
        <CardsCell page={1} pageSize={25} mode="DEFAULT" />
      )}
    </>
  )
}

export default HomePage
