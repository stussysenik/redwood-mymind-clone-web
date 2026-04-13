export const schema = gql`
  type UserPreferences {
    userId: String!
    graphRenderer: String!
  }

  type Query {
    userPreferences: UserPreferences @requireAuth
  }

  type Mutation {
    updateUserPreferences(graphRenderer: String!): UserPreferences! @requireAuth
  }
`
