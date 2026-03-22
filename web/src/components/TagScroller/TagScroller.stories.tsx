import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'

import { TagScroller } from './TagScroller'

const meta: Meta<typeof TagScroller> = {
  title: 'Components/TagScroller',
  component: TagScroller,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: 800, padding: 16 }}>
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
type Story = StoryObj<typeof TagScroller>

/** Dynamic pills generated from platform counts. */
export const WithPlatformCounts: Story = {
  args: {
    platformCounts: {
      instagram: 8,
      youtube: 15,
      spotify: 6,
      goodreads: 4,
      unknown: 22,
      note: 10,
    },
  },
}

/** Explicit static tag list. */
export const StaticTags: Story = {
  args: {
    tags: [
      { id: 'design', label: 'Design', color: '#6366F1' },
      { id: 'reading', label: 'Reading', color: '#22C55E' },
      { id: 'tech', label: 'Tech', color: '#3B82F6' },
      { id: 'films', label: 'Films', color: '#F59E0B' },
      { id: 'music', label: 'Music', color: '#EC4899' },
    ],
    selectedTag: 'design',
    onTagSelect: (id: string | null) => console.log('selected', id),
  },
}

/** Empty — nothing to display, renders an empty scrollable row. */
export const Empty: Story = {
  args: {
    platformCounts: {},
  },
}
