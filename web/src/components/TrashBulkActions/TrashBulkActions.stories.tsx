import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'

import { TrashBulkActions } from './TrashBulkActions'

// TrashBulkActions calls navigate from @redwoodjs/router on success,
// and makes fetch calls to /api/cards/bulk. Both will fail gracefully
// in Storybook — the buttons remain interactive for visual testing.

const meta: Meta<typeof TrashBulkActions> = {
  title: 'Components/TrashBulkActions',
  component: TrashBulkActions,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ padding: 24 }}>
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
type Story = StoryObj<typeof TrashBulkActions>

/** Multiple items in trash. */
export const WithItems: Story = {
  args: {
    itemCount: 12,
  },
}

/** Single item. */
export const SingleItem: Story = {
  args: {
    itemCount: 1,
  },
}

/** Zero items — buttons still render. */
export const Empty: Story = {
  args: {
    itemCount: 0,
  },
}
