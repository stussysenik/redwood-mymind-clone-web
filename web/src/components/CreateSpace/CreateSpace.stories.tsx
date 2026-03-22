import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'

import { CreateSpace } from './CreateSpace'

// CreateSpace uses useMutation from @redwoodjs/web. The mutation will not
// execute in Storybook, but the button and form render correctly for visual
// review. Clicking "Create Space" will show the loading spinner momentarily
// before the mutation silently fails.

const meta: Meta<typeof CreateSpace> = {
  title: 'Components/CreateSpace',
  component: CreateSpace,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof CreateSpace>

/**
 * Default — shows the "Create Space" trigger button.
 * Click it to open the inline modal form.
 */
export const Default: Story = {}
