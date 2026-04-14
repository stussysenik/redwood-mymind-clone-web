// =============================================================================
// GRAPHQL — Graph Clusters
// =============================================================================

export const GRAPH_CLUSTER_FRAGMENT = gql`
  fragment GraphClusterFragment on GraphCluster {
    id
    userId
    spaceId
    name
    note
    nodeIds
    createdAt
    updatedAt
  }
`

export const GRAPH_CLUSTERS_QUERY = gql`
  query GraphClusters($spaceId: String) {
    graphClusters(spaceId: $spaceId) {
      ...GraphClusterFragment
    }
  }
  ${GRAPH_CLUSTER_FRAGMENT}
`

export const CREATE_GRAPH_CLUSTER_MUTATION = gql`
  mutation CreateGraphCluster($input: CreateGraphClusterInput!) {
    createGraphCluster(input: $input) {
      ...GraphClusterFragment
    }
  }
  ${GRAPH_CLUSTER_FRAGMENT}
`

export const UPDATE_GRAPH_CLUSTER_MUTATION = gql`
  mutation UpdateGraphCluster($id: String!, $input: UpdateGraphClusterInput!) {
    updateGraphCluster(id: $id, input: $input) {
      ...GraphClusterFragment
    }
  }
  ${GRAPH_CLUSTER_FRAGMENT}
`

export const DELETE_GRAPH_CLUSTER_MUTATION = gql`
  mutation DeleteGraphCluster($id: String!) {
    deleteGraphCluster(id: $id) {
      id
    }
  }
`

// =============================================================================
// GRAPHQL — Graph Annotations
// =============================================================================

export const GRAPH_ANNOTATION_FRAGMENT = gql`
  fragment GraphAnnotationFragment on GraphAnnotation {
    id
    userId
    anchorType
    anchorId
    text
    offsetX
    offsetY
    offsetZ
    createdAt
    updatedAt
  }
`

export const GRAPH_ANNOTATIONS_QUERY = gql`
  query GraphAnnotations($anchorType: String, $anchorId: String) {
    graphAnnotations(anchorType: $anchorType, anchorId: $anchorId) {
      ...GraphAnnotationFragment
    }
  }
  ${GRAPH_ANNOTATION_FRAGMENT}
`

export const CREATE_GRAPH_ANNOTATION_MUTATION = gql`
  mutation CreateGraphAnnotation($input: CreateGraphAnnotationInput!) {
    createGraphAnnotation(input: $input) {
      ...GraphAnnotationFragment
    }
  }
  ${GRAPH_ANNOTATION_FRAGMENT}
`

export const UPDATE_GRAPH_ANNOTATION_MUTATION = gql`
  mutation UpdateGraphAnnotation($id: String!, $input: UpdateGraphAnnotationInput!) {
    updateGraphAnnotation(id: $id, input: $input) {
      ...GraphAnnotationFragment
    }
  }
  ${GRAPH_ANNOTATION_FRAGMENT}
`

export const DELETE_GRAPH_ANNOTATION_MUTATION = gql`
  mutation DeleteGraphAnnotation($id: String!) {
    deleteGraphAnnotation(id: $id) {
      id
    }
  }
`
