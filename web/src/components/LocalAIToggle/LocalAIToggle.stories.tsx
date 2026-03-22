import type { Meta, StoryObj } from '@storybook/react'

import { LocalAIToggle } from './LocalAIToggle'

// useLocalAI is stubbed at src/lib/local-ai.ts and always returns:
// { status: 'idle', enabled: false, isReady: false, ... }
// The toggle renders in its "disabled" visual state.

const meta: Meta<typeof LocalAIToggle> = {
  title: 'Components/LocalAIToggle',
  component: LocalAIToggle,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof LocalAIToggle>

/**
 * Default — stub returns idle/disabled state.
 * Clicking the toggle calls setEnabled but the stub is a no-op,
 * so the visual state won't change.
 */
export const Default: Story = {}
