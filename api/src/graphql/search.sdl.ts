export const schema = gql`
  type SearchResult {
    cards: [Card!]!
    total: Int!
    mode: String!
  }

  type Query {
    searchCards(query: String!, type: String, tag: String, limit: Int): SearchResult! @requireAuth
    similarCards(cardId: String!, limit: Int): [Card!]! @requireAuth
  }
`
