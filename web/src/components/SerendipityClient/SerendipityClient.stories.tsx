import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'
import { SerendipityClient } from './SerendipityClient'
import {
  createArticleCard,
  createTwitterCard,
  createYouTubeCard,
  createNoteCard,
  createImageCard,
  createMockCard,
} from 'src/mocks/cardFactory'

// SerendipityClient uses @redwoodjs/router navigate and a Supabase realtime
// subscription. Both fail gracefully in Storybook — navigate is a no-op and the
// Supabase channel setup is guarded by a null-check on supabaseBrowser.
const meta: Meta<typeof SerendipityClient> = {
  title: 'Components/SerendipityClient',
  component: SerendipityClient,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/serendipity']}>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof SerendipityClient>

// ─── Shared mock data ────────────────────────────────────────────────────────

const sampleCards = [
  createArticleCard(),
  createTwitterCard(),
  createYouTubeCard(),
  createNoteCard(),
  createImageCard(),
  createMockCard({ title: 'Build in public', type: 'social', tags: ['indie', 'startup'] }),
  createArticleCard({ title: 'Why Boredom is Productive', tags: ['psychology', 'focus'] }),
]

// ─── Stories ─────────────────────────────────────────────────────────────────

/**
 * Default serendipity view showing the focus-card carousel with a mixed set of cards.
 * Use arrow keys (← →) or the on-screen buttons to navigate between cards.
 */
export const Default: Story = {
  args: {
    initialCards: sampleCards,
  },
}

/**
 * Single card — navigation arrows are disabled; shows end-of-list state.
 */
export const SingleCard: Story = {
  args: {
    initialCards: [createArticleCard({ title: 'The Only Card', tags: ['solo'] })],
  },
}

/**
 * Empty state — no cards to display; shows the "Nothing to discover" placeholder.
 */
export const EmptyState: Story = {
  args: {
    initialCards: [],
  },
}
