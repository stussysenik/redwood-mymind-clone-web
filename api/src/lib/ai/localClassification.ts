import type { ClientClassification } from 'src/lib/semantic'
import { buildClientClassification } from 'src/lib/semantic'

type InitialLocalClassificationStateArgs = {
  inputType?: string | null
  inputTitle?: string | null
  inputTags?: string[] | null
  clientClassification: ClientClassification | null
}

type InitialLocalClassificationState = {
  type: string | null
  title: string | null
  tags: string[]
  metadata: Record<string, unknown>
}

function hasExplicitTags(value: string[] | null | undefined): value is string[] {
  return Array.isArray(value) && value.length > 0
}

function shouldPromoteType(inputType: string | null | undefined): boolean {
  return !inputType || inputType === 'website'
}

export function normalizeLocalClassification(
  value: unknown
): ClientClassification | null {
  try {
    return buildClientClassification(value)
  } catch {
    return null
  }
}

export function extractStoredLocalClassification(
  metadata: Record<string, unknown> | null | undefined
): ClientClassification | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const candidates = [
    metadata.localClassification,
    metadata.clientClassification,
    metadata.source === 'local-ai' ? metadata : null,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeLocalClassification(candidate)
    if (normalized) {
      return normalized
    }
  }

  return null
}

export function buildInitialLocalClassificationState(
  args: InitialLocalClassificationStateArgs
): InitialLocalClassificationState {
  const classification = args.clientClassification

  if (!classification) {
    return {
      type: args.inputType || null,
      title: args.inputTitle || null,
      tags: hasExplicitTags(args.inputTags) ? args.inputTags : [],
      metadata: {},
    }
  }

  const titleProvided = typeof args.inputTitle === 'string' && !!args.inputTitle.trim()
  const tagsProvided = hasExplicitTags(args.inputTags)
  const type = shouldPromoteType(args.inputType)
    ? classification.type
    : args.inputType || classification.type

  const metadata: Record<string, unknown> = {
    localClassification: classification,
    summary: classification.summary,
    summarySource: 'local-ai',
    enrichmentSource: 'local-ai',
  }

  if (classification.platform) {
    metadata.platform = classification.platform
  }

  if (!titleProvided) {
    metadata.titleSource = 'local-ai'
  }

  if (!tagsProvided) {
    metadata.tagsSource = 'local-ai'
  }

  return {
    type,
    title: titleProvided ? args.inputTitle || null : classification.title,
    tags: tagsProvided ? args.inputTags || [] : classification.tags,
    metadata,
  }
}
