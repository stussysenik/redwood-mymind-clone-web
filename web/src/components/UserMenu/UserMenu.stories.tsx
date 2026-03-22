import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'

import { UserMenu } from './UserMenu'

// UserMenu makes a real Supabase call on mount to fetch the current user.
// In Storybook (no Supabase env vars) it will show the loading skeleton
// briefly, then fall back to the "Sign in" button state once auth resolves.
// This is acceptable for visual review purposes.

const meta: Meta<typeof UserMenu> = {
  title: 'Components/UserMenu',
  component: UserMenu,
  decorators: [
    (Story) => (
      <MemoryRouter>
        {/* Align right to match its real position in the header */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 16 }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof UserMenu>

/** Default — unauthenticated state shows "Sign in" button. */
export const Default: Story = {}

/** With a settings callback handler. */
export const WithSettingsCallback: Story = {
  args: {
    onOpenSettings: () => console.log('open settings'),
  },
}
