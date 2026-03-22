import type { Meta, StoryObj } from '@storybook/react'

import { AddModal } from './AddModal'

// useLocalAI is stubbed at src/lib/local-ai.ts — always returns idle/disabled
// so no additional mocking is needed.

const meta: Meta<typeof AddModal> = {
  title: 'Components/AddModal',
  component: AddModal,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof AddModal>

/** Modal in its open state, ready for content entry. */
export const Open: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('onClose called'),
  },
}

/** Modal closed — renders nothing. */
export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: () => console.log('onClose called'),
  },
}
