export const API_TOKENS_QUERY = gql`
  query ApiTokensQuery {
    apiTokens {
      id
      name
      prefix
      scopes
      createdAt
      lastUsedAt
      revokedAt
    }
  }
`

export const GENERATE_API_TOKEN_MUTATION = gql`
  mutation GenerateApiTokenMutation($name: String!) {
    generateApiToken(name: $name) {
      plaintext
      token {
        id
        name
        prefix
        createdAt
        lastUsedAt
      }
    }
  }
`

export const REVOKE_API_TOKEN_MUTATION = gql`
  mutation RevokeApiTokenMutation($id: String!) {
    revokeApiToken(id: $id) {
      id
      revokedAt
    }
  }
`
