import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'

import { SuggestedSpaces } from './SuggestedSpaces'

// SuggestedSpaces calls navigate from @redwoodjs/router and fetches /api/spaces
// on create. Both will fail gracefully in Storybook — the cards are still
// fully interactive for visual review.

const meta: Meta<typeof SuggestedSpaces> = {
  title: 'Components/SuggestedSpaces',
  component: SuggestedSpaces,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: 800, padding: 24 }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof SuggestedSpaces>

/** Three cluster suggestions. */
export const WithSuggestions: Story = {
  args: {
    suggestions: [
      { name: 'Design Inspiration', tagFilter: ['design', 'ui', 'ux'], estimatedCount: 34 },
      { name: 'Reading List', tagFilter: ['book', 'reading', 'article'], estimatedCount: 18 },
      { name: 'Tech Bookmarks', tagFilter: ['tech', 'engineering', 'web'], estimatedCount: 52 },
    ],
  },
}

/** Single suggestion. */
export const SingleSuggestion: Story = {
  args: {
    suggestions: [
      { name: 'Music Discoveries', tagFilter: ['music', 'spotify', 'playlist'], estimatedCount: 11 },
    ],
  },
}

/** Empty — component returns null so nothing renders. */
export const Empty: Story = {
  args: {
    suggestions: [],
  },
}
