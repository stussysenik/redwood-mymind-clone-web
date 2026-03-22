import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'
import { SpacesGridClient } from './SpacesGridClient'
import { createMockSpace, createSmartSpace } from 'src/mocks/spaceFactory'

// SpacesGridClient uses @redwoodjs/router navigate and a fetch-based delete.
// Both are no-ops in Storybook — navigate resolves without throwing and the
// DELETE fetch will silently fail, which the component handles gracefully.
const meta: Meta<typeof SpacesGridClient> = {
  title: 'Components/SpacesGridClient',
  component: SpacesGridClient,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/spaces']}>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof SpacesGridClient>

// ─── Shared mock data ────────────────────────────────────────────────────────

const mixedSpaces = [
  createMockSpace({ name: 'Design Inspiration', cardCount: 34 }),
  createSmartSpace({ name: 'Recent Articles', cardCount: 18 }),
  createMockSpace({ name: 'Side Projects', cardCount: 7 }),
  createSmartSpace({ name: 'AI & ML', query: 'type:article #ai', cardCount: 52 }),
  createMockSpace({ name: 'Books to Read', cardCount: 12 }),
  createMockSpace({ name: 'Travel Plans', cardCount: 5 }),
]

// ─── Stories ─────────────────────────────────────────────────────────────────

/**
 * Default grid showing a mix of regular and smart spaces.
 * Hover a card to reveal the delete button.
 */
export const Default: Story = {
  args: {
    spaces: mixedSpaces,
  },
}

/**
 * Single space — minimal grid with just one item.
 */
export const SingleSpace: Story = {
  args: {
    spaces: [createMockSpace({ name: 'My Only Space', cardCount: 3 })],
  },
}

/**
 * Empty state — no spaces yet, shows the placeholder prompt.
 */
export const EmptyState: Story = {
  args: {
    spaces: [],
  },
}
