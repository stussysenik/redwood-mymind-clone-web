import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test as base, type Page } from '@playwright/test'

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.REDWOOD_ENV_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const configuredEmail = process.env.E2E_EMAIL
const configuredPassword = process.env.E2E_PASSWORD

const adminClient: SupabaseClient | null =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null

export interface TestUser {
  email: string
  password: string
  userId: string | null
  ephemeral: boolean
}

export interface CardRow {
  id: string
  user_id: string
  type: string
  title: string | null
  content: string | null
  url: string | null
  image_url: string | null
  metadata: Record<string, unknown>
  tags: string[]
  archived_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

interface SpaceRow {
  id: string
  user_id: string
  name: string
  query: string | null
  is_smart: boolean
  created_at: string
}

function requireAdminClient(): SupabaseClient {
  if (!adminClient) {
    throw new Error(
      'SUPABASE_URL/REDWOOD_ENV_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for self-contained E2E runs'
    )
  }

  return adminClient
}

async function createEphemeralUser(): Promise<TestUser> {
  const client = requireAdminClient()
  const email = `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const password = `E2E-${Math.random().toString(36).slice(2, 10)}-Aa1!`

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      source: 'playwright-e2e',
    },
  })

  if (error || !data.user) {
    throw new Error(
      `Failed to provision E2E user: ${error?.message ?? 'unknown error'}`
    )
  }

  return {
    email,
    password,
    userId: data.user.id,
    ephemeral: true,
  }
}

async function cleanupTestUser(user: TestUser): Promise<void> {
  if (!user.ephemeral || !user.userId || !adminClient) {
    return
  }

  await adminClient.from('spaces').delete().eq('user_id', user.userId)
  await adminClient.from('cards').delete().eq('user_id', user.userId)
  await adminClient.auth.admin.deleteUser(user.userId)
}

export const test = base.extend<{ testUser: TestUser }>({
  testUser: async ({}, use) => {
    const reusableUser =
      configuredEmail && configuredPassword
        ? {
            email: configuredEmail,
            password: configuredPassword,
            userId: null,
            ephemeral: false,
          }
        : null

    const testUser = adminClient
      ? await createEphemeralUser()
      : reusableUser ??
        (() => {
          throw new Error(
            'E2E requires either Supabase admin credentials or E2E_EMAIL/E2E_PASSWORD'
          )
        })()

    try {
      await use(testUser)
    } finally {
      await cleanupTestUser(testUser)
    }
  },
})

export { expect }

export async function login(page: Page, testUser: TestUser) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  await page.fill('input[type="email"]', testUser.email)
  await page.fill('input[type="password"]', testUser.password)
  await page.click('button:has-text("Sign In")')

  await page.waitForURL('/', { timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

export async function createCard(
  testUser: TestUser,
  input: {
    type?: string
    title?: string | null
    content?: string | null
    url?: string | null
    imageUrl?: string | null
    metadata?: Record<string, unknown>
    tags?: string[]
    archivedAt?: string | null
    deletedAt?: string | null
  }
): Promise<CardRow> {
  if (!testUser.userId) {
    throw new Error('Direct card seeding requires an ephemeral E2E user')
  }

  const client = requireAdminClient()
  const { data, error } = await client
    .from('cards')
    .insert({
      user_id: testUser.userId,
      type: input.type ?? 'website',
      title: input.title ?? null,
      content: input.content ?? null,
      url: input.url ?? null,
      image_url: input.imageUrl ?? null,
      metadata: input.metadata ?? {},
      tags: input.tags ?? [],
      archived_at: input.archivedAt ?? null,
      deleted_at: input.deletedAt ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to seed card: ${error?.message ?? 'unknown error'}`
    )
  }

  return data as CardRow
}

export async function getCardByUrl(
  testUser: TestUser,
  url: string
): Promise<CardRow | null> {
  if (!testUser.userId) {
    return null
  }

  const client = requireAdminClient()
  const { data, error } = await client
    .from('cards')
    .select('*')
    .eq('user_id', testUser.userId)
    .eq('url', url)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch card by url: ${error.message}`)
  }

  return (data as CardRow | null) ?? null
}

export async function getCardById(
  testUser: TestUser,
  cardId: string
): Promise<CardRow | null> {
  if (!testUser.userId) {
    return null
  }

  const client = requireAdminClient()
  const { data, error } = await client
    .from('cards')
    .select('*')
    .eq('user_id', testUser.userId)
    .eq('id', cardId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch card by id: ${error.message}`)
  }

  return (data as CardRow | null) ?? null
}

export async function getSpaceByName(
  testUser: TestUser,
  name: string
): Promise<SpaceRow | null> {
  if (!testUser.userId) {
    return null
  }

  const client = requireAdminClient()
  const { data, error } = await client
    .from('spaces')
    .select('*')
    .eq('user_id', testUser.userId)
    .eq('name', name)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch space by name: ${error.message}`)
  }

  return (data as SpaceRow | null) ?? null
}

/**
 * Seed a card plus two pending enrichment review items (title + description)
 * for the review surface tests. Returns the seeded card so callers can assert
 * against it.
 */
export async function seedReviewItems(
  testUser: TestUser
): Promise<CardRow> {
  if (!testUser.userId) {
    throw new Error('seedReviewItems requires an ephemeral E2E user')
  }
  const client = requireAdminClient()

  const card = await createCard(testUser, {
    type: 'website',
    title: 'Untitled Note',
    content: 'Seeded for review-surface E2E — a card with a weak title.',
    url: 'https://example.test/review-seed',
    metadata: { summary: 'Seed summary with stale confidence.' },
  })

  const { error } = await client.from('enrichment_review_items').insert([
    {
      card_id: card.id,
      user_id: testUser.userId,
      kind: 'title',
      proposed_value: 'Review Surface Seed Title',
      current_value: card.title,
      confidence: 0.72,
      critique: 'Placeholder critic rationale for the seeded title.',
    },
    {
      card_id: card.id,
      user_id: testUser.userId,
      kind: 'description',
      proposed_value: 'A concise, neutral, two-sentence seeded description.',
      current_value: 'Seed summary with stale confidence.',
      confidence: 0.68,
      critique: 'Placeholder critic rationale for the seeded description.',
    },
  ])

  if (error) {
    throw new Error(`Failed to seed review items: ${error.message}`)
  }

  return card
}

/**
 * Seed `count` diverse cards for the graph page.
 * Cards share tags so d3-force-link edges form (the graph needs connected nodes
 * to visually render something useful in all three renderer backends).
 */
export async function seedGraphCards(
  testUser: TestUser,
  count = 8
): Promise<CardRow[]> {
  const CARD_TYPES = ['article', 'note', 'image', 'book', 'video', 'social', 'product', 'movie']
  const SHARED_TAGS = ['design', 'tech', 'research', 'ideas']

  const cards: CardRow[] = []
  for (let i = 0; i < count; i++) {
    const type = CARD_TYPES[i % CARD_TYPES.length]
    // Each card gets 2 tags: one shared (cycling through SHARED_TAGS) and one
    // unique. Adjacent cards share a tag, ensuring graph edges exist.
    const tag1 = SHARED_TAGS[i % SHARED_TAGS.length]
    const tag2 = SHARED_TAGS[(i + 1) % SHARED_TAGS.length]
    const card = await createCard(testUser, {
      type,
      title: `Graph seed card ${i + 1} (${type})`,
      content: `Seeded for graph renderer E2E test — card ${i + 1}`,
      tags: [tag1, tag2],
    })
    cards.push(card)
  }
  return cards
}

export async function saveLink(page: Page, url: string) {
  const modalTextarea = page.locator('textarea[placeholder*="Save something"]')

  await page.getByRole('button', { name: /add new/i }).click()
  await expect(modalTextarea).toBeVisible({ timeout: 3000 })
  await modalTextarea.fill(url)
  await page.getByRole('button', { name: /save to brain/i }).click()
  await expect(modalTextarea).not.toBeVisible({ timeout: 3000 })
}
