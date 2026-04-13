export const schema = gql`
  type GraphCluster {
    id: String!
    userId: String!
    spaceId: String
    name: String!
    note: String
    nodeIds: [String!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateGraphClusterInput {
    spaceId: String
    name: String!
    note: String
    nodeIds: [String!]!
  }

  input UpdateGraphClusterInput {
    spaceId: String
    name: String
    note: String
    nodeIds: [String!]
  }

  type Query {
    graphClusters(spaceId: String): [GraphCluster!]! @requireAuth
    graphCluster(id: String!): GraphCluster @requireAuth
  }

  type Mutation {
    createGraphCluster(input: CreateGraphClusterInput!): GraphCluster! @requireAuth
    updateGraphCluster(id: String!, input: UpdateGraphClusterInput!): GraphCluster! @requireAuth
    deleteGraphCluster(id: String!): GraphCluster! @requireAuth
  }
`
