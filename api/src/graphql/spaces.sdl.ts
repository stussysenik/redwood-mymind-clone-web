export const schema = gql`
  type Space {
    id: String!
    userId: String!
    name: String!
    query: String
    isSmart: Boolean!
    createdAt: DateTime!
    cardCount: Int!
    cards: [Card!]!
  }

  type SpaceSuggestion {
    name: String!
    tagFilter: [String!]!
    cardCount: Int!
  }

  type Query {
    spaces: [Space!]! @requireAuth
    space(id: String!): Space @requireAuth
    spaceSuggestions: [SpaceSuggestion!]! @requireAuth
  }

  input CreateSpaceInput {
    name: String!
    query: String
    isSmart: Boolean
  }

  input UpdateSpaceInput {
    name: String
    query: String
  }

  type Mutation {
    createSpace(input: CreateSpaceInput!): Space! @requireAuth
    updateSpace(id: String!, input: UpdateSpaceInput!): Space! @requireAuth
    deleteSpace(id: String!): Space! @requireAuth
  }
`
