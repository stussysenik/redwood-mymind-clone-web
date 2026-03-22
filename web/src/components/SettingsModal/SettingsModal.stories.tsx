import type { Meta, StoryObj } from '@storybook/react'

import { SettingsModal } from './SettingsModal'

// SettingsModal uses createPortal — it renders into document.body.
// useTheme is provided by the global ThemeProvider decorator.

const meta: Meta<typeof SettingsModal> = {
  title: 'Components/SettingsModal',
  component: SettingsModal,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof SettingsModal>

/** Modal open on the Theme tab. */
export const Open: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('onClose'),
  },
}

/** Modal closed — renders nothing. */
export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: () => console.log('onClose'),
  },
}
