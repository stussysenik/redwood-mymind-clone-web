export const schema = gql`
  type Card {
    id: String!
    userId: String!
    type: String!
    title: String
    content: String
    url: String
    imageUrl: String
    metadata: JSON!
    tags: [String!]!
    createdAt: DateTime!
    updatedAt: DateTime!
    deletedAt: DateTime
    archivedAt: DateTime
  }

  type PaginatedCards {
    cards: [Card!]!
    total: Int!
    page: Int!
    pageSize: Int!
    hasMore: Boolean!
  }

  enum CardMode {
    DEFAULT
    ARCHIVE
    TRASH
  }

  type Query {
    cards(page: Int, pageSize: Int, mode: CardMode): PaginatedCards! @requireAuth
    card(id: String!): Card @requireAuth
    randomCards(limit: Int): [Card!]! @requireAuth
  }

  input SaveCardInput {
    url: String
    type: String
    title: String
    content: String
    imageUrl: String
    tags: [String!]
    source: String
    clientClassification: JSON
  }

  input UpdateCardInput {
    title: String
    content: String
    type: String
    tags: [String!]
    metadata: JSON
    imageUrl: String
  }

  enum BulkAction {
    EMPTY_TRASH
    RESTORE_ALL
    ARCHIVE_ALL
    UNARCHIVE_ALL
  }

  type BulkResult {
    success: Boolean!
    affectedCount: Int!
  }

  type Mutation {
    saveCard(input: SaveCardInput!): Card! @requireAuth
    updateCard(id: String!, input: UpdateCardInput!): Card! @requireAuth
    deleteCard(id: String!, permanent: Boolean): Card @requireAuth
    archiveCard(id: String!): Card! @requireAuth
    unarchiveCard(id: String!): Card! @requireAuth
    restoreCard(id: String!): Card! @requireAuth
    reExtractImage(cardId: String!): Card! @requireAuth
    bulkCardAction(action: BulkAction!): BulkResult! @requireAuth
  }
`
