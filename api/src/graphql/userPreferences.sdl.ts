export const schema = gql`
  type UserPreferences {
    userId: String!
    graphRenderer: String!
    graphDimension: String!
  }

  type Query {
    userPreferences: UserPreferences @requireAuth
  }

  type Mutation {
    updateUserPreferences(
      graphRenderer: String
      graphDimension: String
    ): UserPreferences! @requireAuth
  }
`
