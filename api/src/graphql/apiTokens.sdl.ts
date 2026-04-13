import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import {
  generateApiToken as serviceGenerate,
  listApiTokens as serviceList,
  revokeApiToken as serviceRevoke,
} from 'src/services/apiTokens/apiTokens'

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

export const apiTokens: QueryResolvers['apiTokens'] = async () => {
  const userId = context.currentUser!.id
  return serviceList({ userId })
}

export const generateApiToken: MutationResolvers['generateApiToken'] = async ({
  name,
}) => {
  const userId = context.currentUser!.id
  if (!name || name.trim().length === 0) {
    throw new Error('Token name is required')
  }
  return serviceGenerate({ userId, name: name.trim() })
}

export const revokeApiToken: MutationResolvers['revokeApiToken'] = async ({
  id,
}) => {
  const userId = context.currentUser!.id
  return serviceRevoke({ id, userId })
}
