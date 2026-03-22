import type { Meta, StoryObj, Decorator } from '@storybook/react'
import { GraphClient } from './GraphClient'
import {
  createArticleCard,
  createTwitterCard,
  createYouTubeCard,
  createNoteCard,
  createImageCard,
  createMockCard,
} from 'src/mocks/cardFactory'

// ---------------------------------------------------------------------------
// Fetch mock decorator
//
// GraphClient has no props — it fetches /api/graph internally.  In Storybook
// there is no API server, so we patch globalThis.fetch for each story to
// return a pre-built cards array.  The real fetch is restored after the
// component unmounts via the decorator's cleanup return.
// ---------------------------------------------------------------------------

type FetchPayload = { cards: unknown[] }

function makeFetchDecorator(payload: FetchPayload): Decorator {
  return (Story) => {
    const original = globalThis.fetch
    globalThis.fetch = async (_input: RequestInfo | URL) => {
      await new Promise((r) => setTimeout(r, 200)) // simulate a brief network delay
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Restore after the story renders (best-effort — Storybook re-renders sync)
    // A full teardown would use a React effect inside a wrapper component, but
    // for Storybook preview this is sufficient.
    setTimeout(() => {
      globalThis.fetch = original
    }, 5000)
    return <Story />
  }
}

// ---------------------------------------------------------------------------
// Mock graph card payloads (raw API shape — matches what /api/graph returns)
// ---------------------------------------------------------------------------

function toApiShape(card: ReturnType<typeof createArticleCard>) {
  return {
    id: card.id,
    title: card.title,
    image_url: card.imageUrl,
    type: card.type,
    tags: card.tags,
    metadata: card.metadata ?? null,
  }
}

const richCards = [
  createArticleCard({ tags: ['web', 'architecture', 'frontend'] }),
  createArticleCard({ title: 'CSS Grid Deep Dive', tags: ['css', 'frontend', 'layout'] }),
  createTwitterCard({ tags: ['ai', 'technology', 'future'] }),
  createTwitterCard({ title: 'Indie hacking is freedom', tags: ['indie', 'startup', 'technology'] }),
  createYouTubeCard({ tags: ['redwoodjs', 'tutorial', 'fullstack', 'web'] }),
  createNoteCard({ tags: ['meeting', 'planning', 'q1'] }),
  createImageCard({ tags: ['design', 'ui', 'frontend'] }),
  createMockCard({ title: 'GraphQL Best Practices', tags: ['graphql', 'api', 'architecture'] }),
  createMockCard({ title: 'Edge Functions 101', tags: ['edge', 'cloud', 'web', 'architecture'] }),
].map(toApiShape)

const sparseCards = [
  createArticleCard({ tags: ['web'] }),
  createNoteCard({ tags: ['meeting'] }),
  createImageCard({ tags: ['design'] }),
].map(toApiShape)

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof GraphClient> = {
  title: 'Components/GraphClient',
  component: GraphClient,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Force-directed 2D knowledge graph. Nodes are cards; edges connect cards that share tags. ' +
          'Uses react-force-graph-2d (lazy-loaded). In Storybook the /api/graph fetch is intercepted by a decorator.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof GraphClient>

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/**
 * Rich graph — 9 cards with overlapping tags produce a dense network of edges.
 * The ForceGraph2D canvas loads asynchronously; a spinner is shown briefly.
 */
export const RichGraph: Story = {
  decorators: [makeFetchDecorator({ cards: richCards })],
}

/**
 * Sparse graph — 3 cards with no shared tags.
 * After loading, the "No connections yet" empty state is displayed because no
 * edges meet the default minWeight of 1.
 */
export const NoConnections: Story = {
  decorators: [makeFetchDecorator({ cards: sparseCards })],
}

/**
 * Error state — the fetch decorator returns a 500, triggering the error UI.
 */
export const ErrorState: Story = {
  decorators: [
    (Story) => {
      const original = globalThis.fetch
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 })
      setTimeout(() => { globalThis.fetch = original }, 5000)
      return <Story />
    },
  ],
}
