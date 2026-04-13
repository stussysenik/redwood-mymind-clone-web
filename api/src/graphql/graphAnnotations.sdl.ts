export const schema = gql`
  type GraphAnnotation {
    id: String!
    userId: String!
    anchorType: String!
    anchorId: String!
    text: String!
    offsetX: Float
    offsetY: Float
    offsetZ: Float
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateGraphAnnotationInput {
    anchorType: String!
    anchorId: String!
    text: String!
    offsetX: Float
    offsetY: Float
    offsetZ: Float
  }

  input UpdateGraphAnnotationInput {
    anchorType: String
    anchorId: String
    text: String
    offsetX: Float
    offsetY: Float
    offsetZ: Float
  }

  type Query {
    graphAnnotations(anchorType: String, anchorId: String): [GraphAnnotation!]! @requireAuth
    graphAnnotation(id: String!): GraphAnnotation @requireAuth
  }

  type Mutation {
    createGraphAnnotation(input: CreateGraphAnnotationInput!): GraphAnnotation! @requireAuth
    updateGraphAnnotation(id: String!, input: UpdateGraphAnnotationInput!): GraphAnnotation! @requireAuth
    deleteGraphAnnotation(id: String!): GraphAnnotation! @requireAuth
  }
`
