export const schema = gql`
  type EnrichmentResult {
    success: Boolean!
    cardId: String!
    stage: String
    error: String
  }

  type ScreenshotResult {
    success: Boolean!
    url: String
    source: String
    platform: String
    error: String
  }

  type GraphNode {
    id: String!
    title: String
    imageUrl: String
    type: String!
    tags: [String!]!
    colors: [String!]
    connections: Int!
  }

  type GraphLink {
    source: String!
    target: String!
    sharedTags: [String!]!
    weight: Int!
  }

  type GraphData {
    nodes: [GraphNode!]!
    links: [GraphLink!]!
  }

  type Query {
    graphData(spaceId: String, tag: String, minWeight: Int): GraphData! @requireAuth
  }

  type Mutation {
    enrichCard(cardId: String!): EnrichmentResult! @requireAuth
    captureScreenshot(url: String!): ScreenshotResult! @requireAuth
    backfillEmbeddings(limit: Int): Int! @requireAuth
  }
`
