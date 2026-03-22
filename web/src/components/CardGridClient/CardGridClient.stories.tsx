import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'
import { CardGridClient } from './CardGridClient'
import {
  createMockCard,
  createTwitterCard,
  createYouTubeCard,
  createArticleCard,
  createNoteCard,
  createImageCard,
} from 'src/mocks/cardFactory'

// CardGridClient uses @redwoodjs/router's useLocation — wrap in MemoryRouter
// so the hook resolves without throwing. The useMutation stubs are no-ops.
const meta: Meta<typeof CardGridClient> = {
  title: 'Components/CardGridClient',
  component: CardGridClient,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/']}>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof CardGridClient>

// ─── Shared mock data ────────────────────────────────────────────────────────

const mixedCards = [
  createArticleCard(),
  createTwitterCard(),
  createYouTubeCard(),
  createNoteCard(),
  createImageCard(),
  createMockCard({ title: 'A Quick Thought', type: 'note', tags: ['ideas'] }),
  createArticleCard({ title: 'CSS Grid Deep Dive', tags: ['css', 'frontend'] }),
  createTwitterCard({ title: 'Ship it. Then iterate.' }),
]

// ─── Stories ─────────────────────────────────────────────────────────────────

/**
 * Default grid view with a mixed set of card types and pagination metadata.
 */
export const Default: Story = {
  args: {
    cards: mixedCards,
    totalCount: mixedCards.length,
    page: 1,
    pageSize: 25,
    hasMore: false,
    mode: 'default',
  },
}

/**
 * Large grid that triggers pagination controls (hasMore = true, page 1 of 4).
 */
export const WithPagination: Story = {
  args: {
    cards: mixedCards,
    totalCount: 100,
    page: 1,
    pageSize: 25,
    hasMore: true,
    mode: 'default',
    onPageChange: (p) => console.log('page changed to', p),
  },
}

/**
 * Archive mode — cards are displayed with the "archived" styling context.
 */
export const ArchiveMode: Story = {
  args: {
    cards: mixedCards.slice(0, 4).map((c) => ({
      ...c,
      archivedAt: '2025-01-10T12:00:00Z',
    })),
    totalCount: 4,
    page: 1,
    pageSize: 25,
    hasMore: false,
    mode: 'archive',
  },
}

/**
 * Empty state — no cards, shows the empty placeholder UI.
 */
export const Empty: Story = {
  args: {
    cards: [],
    totalCount: 0,
    page: 1,
    pageSize: 25,
    hasMore: false,
    mode: 'default',
  },
}
