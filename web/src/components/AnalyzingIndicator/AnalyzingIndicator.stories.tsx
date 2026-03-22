import type { Meta, StoryObj } from '@storybook/react'
import { AnalyzingIndicator, AnalyzingOverlay } from './AnalyzingIndicator'

const meta: Meta<typeof AnalyzingIndicator> = {
  title: 'Components/AnalyzingIndicator',
  component: AnalyzingIndicator,
}
export default meta
type Story = StoryObj<typeof AnalyzingIndicator>

export const Default: Story = {
  args: {
    variant: 'dark',
    size: 'sm',
  },
  decorators: [
    (Story) => (
      <div className="p-8 bg-gray-800 rounded-xl inline-block">
        <Story />
      </div>
    ),
  ],
}

export const LightVariant: Story = {
  args: {
    variant: 'light',
    size: 'md',
    label: 'Analyzing',
  },
  decorators: [
    (Story) => (
      <div className="p-8 bg-white rounded-xl inline-block border">
        <Story />
      </div>
    ),
  ],
}

export const GlassVariant: Story = {
  args: {
    variant: 'glass',
    size: 'md',
  },
  decorators: [
    (Story) => (
      <div
        className="p-8 rounded-xl inline-block"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export const WithServerStage: Story = {
  args: {
    variant: 'dark',
    size: 'md',
    serverStage: 'analyzing',
  },
  decorators: [
    (Story) => (
      <div className="p-8 bg-gray-800 rounded-xl inline-block">
        <Story />
      </div>
    ),
  ],
}

export const FinalizingStage: Story = {
  args: {
    variant: 'dark',
    size: 'lg',
    serverStage: 'finalizing',
    accentColor: '#6366f1',
  },
  decorators: [
    (Story) => (
      <div className="p-8 bg-gray-900 rounded-xl inline-block">
        <Story />
      </div>
    ),
  ],
}

export const Overlay: StoryObj<typeof AnalyzingOverlay> = {
  render: () => (
    <div className="relative w-64 h-40 bg-gray-700 rounded-xl overflow-hidden">
      <img
        src="https://picsum.photos/seed/art1/400/300"
        alt="Card preview"
        className="w-full h-full object-cover"
      />
      <AnalyzingOverlay visible={true} progress={60} accentColor="#6366f1" />
    </div>
  ),
}
