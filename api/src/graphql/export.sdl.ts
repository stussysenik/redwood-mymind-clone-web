export const schema = gql`
  input ExportOptions {
    categories: [ExportCategory!]!
    format: ExportFormat!
    spaceId: String
    tag: String
    dateFrom: String
    dateTo: String
    includeArchived: Boolean
    includeTrash: Boolean
  }

  enum ExportCategory {
    CORE
    CONTENT
    MEDIA
    METADATA
  }

  enum ExportFormat {
    CSV
    JSON
    JSONL
    MARKDOWN
  }

  type ExportJob {
    jobId: String!
    status: ExportStatus!
    progress: Int
    downloadUrl: String
    fileCount: Int
    totalSize: Int
    expiresAt: String
    error: String
  }

  enum ExportStatus {
    QUEUED
    PROCESSING
    COMPLETE
    FAILED
  }

  type Query {
    exportJob(jobId: String!): ExportJob @requireAuth
  }

  type Mutation {
    startExport(options: ExportOptions!): ExportJob! @requireAuth
  }
`
