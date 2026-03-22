import { Metadata } from '@redwoodjs/web'
import { useQuery } from '@redwoodjs/web'

import SpacesCell from 'src/components/SpacesCell'
import { CreateSpace } from 'src/components/CreateSpace/CreateSpace'
import { SuggestedSpaces } from 'src/components/SuggestedSpaces/SuggestedSpaces'

const SPACE_SUGGESTIONS_QUERY = gql`
  query SpaceSuggestionsQuery {
    spaceSuggestions {
      name
      tagFilter
      cardCount
    }
  }
`

const SpacesPage = () => {
  const { data: suggestionsData } = useQuery(SPACE_SUGGESTIONS_QUERY)

  const suggestions = (suggestionsData?.spaceSuggestions ?? []).map(
    (s: { name: string; tagFilter: string[]; cardCount: number }) => ({
      name: s.name,
      tagFilter: s.tagFilter,
      estimatedCount: s.cardCount,
    })
  )

  return (
    <>
      <Metadata title="Spaces" />
      <div
        className="px-4 sm:px-6 py-6"
        style={{ maxWidth: 1200, margin: '0 auto' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2
            className="font-serif text-xl"
            style={{ color: 'var(--foreground)' }}
          >
            Spaces
          </h2>
          <CreateSpace />
        </div>

        {suggestions.length > 0 && (
          <div className="mb-8">
            <SuggestedSpaces suggestions={suggestions} />
          </div>
        )}

        <SpacesCell />
      </div>
    </>
  )
}

export default SpacesPage
