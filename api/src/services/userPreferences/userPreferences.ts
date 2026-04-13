import { context } from '@redwoodjs/graphql-server'

import { db } from 'src/lib/db'

const VALID_RENDERERS = ['canvas', 'webgl', 'three'] as const
type RendererBackend = (typeof VALID_RENDERERS)[number]

function currentUserId(): string {
  return context.currentUser!.id as string
}

export async function userPreferences() {
  const userId = currentUserId()
  const row = await db.userPreferences.findUnique({ where: { userId } })
  if (!row) return { userId, graphRenderer: 'canvas' }
  return row
}

export async function updateUserPreferences({
  graphRenderer,
}: {
  graphRenderer: string
}) {
  if (!(VALID_RENDERERS as readonly string[]).includes(graphRenderer)) {
    throw new Error(
      `Invalid renderer: "${graphRenderer}". Must be one of: ${VALID_RENDERERS.join(', ')}`
    )
  }

  const userId = currentUserId()
  return db.userPreferences.upsert({
    where: { userId },
    create: { userId, graphRenderer: graphRenderer as RendererBackend },
    update: { graphRenderer: graphRenderer as RendererBackend },
  })
}
