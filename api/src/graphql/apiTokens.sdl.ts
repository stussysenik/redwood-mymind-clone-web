export const schema = gql`
  type ApiToken {
    id: String!
    name: String!
    prefix: String!
    scopes: [String!]!
    createdAt: DateTime!
    lastUsedAt: DateTime
    revokedAt: DateTime
  }

  type GeneratedApiToken {
    token: ApiToken!
    plaintext: String!
  }

  type Query {
    apiTokens: [ApiToken!]! @requireAuth
  }

  type Mutation {
    generateApiToken(name: String!): GeneratedApiToken! @requireAuth
    revokeApiToken(id: String!): ApiToken! @requireAuth
  }
`
