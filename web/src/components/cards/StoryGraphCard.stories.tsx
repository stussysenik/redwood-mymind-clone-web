import type { Meta, StoryObj } from '@storybook/react'
import { StoryGraphCard } from './StoryGraphCard'
import { createStoryGraphCard } from 'src/mocks/cardFactory'

const meta: Meta<typeof StoryGraphCard> = {
  title: 'Cards/StoryGraphCard',
  component: StoryGraphCard,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof StoryGraphCard>

export const Default: Story = {
  args: {
    card: createStoryGraphCard(),
    index: 0,
  },
}

export const WithoutImage: Story = {
  args: {
    card: createStoryGraphCard({ imageUrl: null }),
    index: 1,
  },
}

export const Processing: Story = {
  args: {
    card: createStoryGraphCard({
      metadata: {
        platform: 'storygraph',
        processing: true,
        enrichmentStage: 'analyzing',
        enrichmentTiming: {
          startedAt: Date.now() - 3000,
          estimatedTotalMs: 8000,
          platform: 'storygraph',
        },
      },
      tags: [],
    }),
    index: 2,
  },
}

export const WithActions: Story = {
  args: {
    card: createStoryGraphCard(),
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

export const Minimal: Story = {
  args: {
    card: createStoryGraphCard({
      title: 'A Novel',
      content: null,
      imageUrl: null,
      tags: [],
      metadata: {
        platform: 'storygraph',
        enrichmentStage: 'complete',
      },
    }),
  },
}
