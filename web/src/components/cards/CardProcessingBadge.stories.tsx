import type { Meta, StoryObj } from '@storybook/react'
import { CardProcessingBadge } from './CardProcessingBadge'

const meta: Meta<typeof CardProcessingBadge> = {
  title: 'Cards/CardProcessingBadge',
  component: CardProcessingBadge,
}
export default meta
type Story = StoryObj<typeof CardProcessingBadge>

const processingMetadata = {
  processing: true,
  enrichmentStage: 'analyzing' as const,
  enrichmentTiming: {
    startedAt: Date.now() - 3000,
    estimatedTotalMs: 8000,
    platform: 'unknown',
  },
}

export const Default: Story = {
  args: {
    cardId: 'mock-card-1',
    metadata: processingMetadata,
    createdAt: new Date().toISOString(),
    accentColor: '#6366f1',
  },
  decorators: [
    (Story) => (
      <div className="relative w-48 h-32 bg-gray-800 rounded-xl">
        <Story />
      </div>
    ),
  ],
}

export const FetchingStage: Story = {
  args: {
    cardId: 'mock-card-2',
    metadata: {
      ...processingMetadata,
      enrichmentStage: 'fetching' as const,
    },
    createdAt: new Date().toISOString(),
    accentColor: '#f59e0b',
  },
  decorators: [
    (Story) => (
      <div className="relative w-48 h-32 bg-gray-800 rounded-xl">
        <Story />
      </div>
    ),
  ],
}

export const FinalizingStage: Story = {
  args: {
    cardId: 'mock-card-3',
    metadata: {
      ...processingMetadata,
      enrichmentStage: 'finalizing' as const,
    },
    createdAt: new Date().toISOString(),
    accentColor: '#10b981',
  },
  decorators: [
    (Story) => (
      <div className="relative w-48 h-32 bg-gray-800 rounded-xl">
        <Story />
      </div>
    ),
  ],
}

export const LightVariant: Story = {
  args: {
    cardId: 'mock-card-4',
    metadata: processingMetadata,
    createdAt: new Date().toISOString(),
    accentColor: '#6366f1',
    variant: 'light',
  },
  decorators: [
    (Story) => (
      <div className="relative w-48 h-32 bg-gray-100 rounded-xl border">
        <Story />
      </div>
    ),
  ],
}
