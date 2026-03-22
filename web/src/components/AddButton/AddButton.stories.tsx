import type { Meta, StoryObj } from '@storybook/react'

import { AddButton } from './AddButton'

// AddButton renders a fixed-position FAB. The story uses a tall container so
// the button sits within the visible canvas area.

const meta: Meta<typeof AddButton> = {
  title: 'Components/AddButton',
  component: AddButton,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof AddButton>

/** Default floating action button — click to open AddModal. */
export const Default: Story = {}
