import { context } from '@redwoodjs/graphql-server'

import { db } from 'src/lib/db'

const VALID_RENDERERS = ['canvas', 'webgl', 'three'] as const
type RendererBackend = (typeof VALID_RENDERERS)[number]

const VALID_DIMENSIONS = ['2d', '3d'] as const
type GraphDimension = (typeof VALID_DIMENSIONS)[number]

function currentUserId(): string {
  return context.currentUser!.id as string
}

export async function userPreferences() {
  const userId = currentUserId()
  const row = await db.userPreferences.findUnique({ where: { userId } })
  if (!row) return { userId, graphRenderer: 'canvas', graphDimension: '2d' }
  return row
}

export async function updateUserPreferences({
  graphRenderer,
  graphDimension,
}: {
  graphRenderer?: string | null
  graphDimension?: string | null
}) {
  if (
    graphRenderer != null &&
    !(VALID_RENDERERS as readonly string[]).includes(graphRenderer)
  ) {
    throw new Error(
      `Invalid renderer: "${graphRenderer}". Must be one of: ${VALID_RENDERERS.join(', ')}`
    )
  }
  if (
    graphDimension != null &&
    !(VALID_DIMENSIONS as readonly string[]).includes(graphDimension)
  ) {
    throw new Error(
      `Invalid dimension: "${graphDimension}". Must be one of: ${VALID_DIMENSIONS.join(', ')}`
    )
  }

  const userId = currentUserId()
  const createData: {
    userId: string
    graphRenderer: RendererBackend
    graphDimension: GraphDimension
  } = {
    userId,
    graphRenderer: (graphRenderer ?? 'canvas') as RendererBackend,
    graphDimension: (graphDimension ?? '2d') as GraphDimension,
  }
  const updateData: {
    graphRenderer?: RendererBackend
    graphDimension?: GraphDimension
  } = {}
  if (graphRenderer != null) updateData.graphRenderer = graphRenderer as RendererBackend
  if (graphDimension != null) updateData.graphDimension = graphDimension as GraphDimension

  return db.userPreferences.upsert({
    where: { userId },
    create: createData,
    update: updateData,
  })
}
