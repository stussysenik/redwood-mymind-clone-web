export const schema = gql`
  type EnrichmentReviewItem {
    id: String!
    cardId: String!
    userId: String!
    kind: String!
    proposedValue: String!
    currentValue: String
    confidence: Float!
    critique: String
    createdAt: DateTime!
    resolvedAt: DateTime
    resolution: String
    editedValue: String
  }

  type EnrichmentReviewItemEdge {
    node: EnrichmentReviewItem!
    cursor: String!
  }

  type EnrichmentReviewItemPageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type EnrichmentReviewItemConnection {
    edges: [EnrichmentReviewItemEdge!]!
    pageInfo: EnrichmentReviewItemPageInfo!
    totalCount: Int!
  }

  enum EnrichmentReviewKind {
    title
    description
    any
  }

  enum EnrichmentReviewResolution {
    accept
    reject
    edit
    skip
  }

  type Query {
    pendingEnrichmentReviewItems(
      first: Int
      after: String
      kind: EnrichmentReviewKind
    ): EnrichmentReviewItemConnection! @requireAuth
  }

  type Mutation {
    resolveEnrichmentReviewItem(
      id: String!
      resolution: EnrichmentReviewResolution!
      editedValue: String
    ): EnrichmentReviewItem! @requireAuth
  }
`
