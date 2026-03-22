export const schema = gql`
  type SearchResult {
    cards: [Card!]!
    total: Int!
    mode: String!
  }

  type SimilarMatch {
    id: String!
    score: Float!
  }

  type SimilarResult {
    matches: [SimilarMatch!]!
    cards: [Card!]!
  }

  type Query {
    searchCards(query: String!, type: String, tag: String, limit: Int): SearchResult! @requireAuth
    similarCards(cardId: String, text: String, topK: Int): SimilarResult! @requireAuth
  }
`
