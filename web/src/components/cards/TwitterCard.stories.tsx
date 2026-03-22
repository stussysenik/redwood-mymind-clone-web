import type { Meta, StoryObj } from '@storybook/react'
import { TwitterCard } from './TwitterCard'
import { createTwitterCard } from 'src/mocks/cardFactory'

const meta: Meta<typeof TwitterCard> = {
  title: 'Cards/TwitterCard',
  component: TwitterCard,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof TwitterCard>

export const Default: Story = {
  args: {
    card: createTwitterCard(),
    index: 0,
  },
}

export const WithoutImage: Story = {
  args: {
    card: createTwitterCard({ imageUrl: null }),
    index: 1,
  },
}

export const Processing: Story = {
  args: {
    card: createTwitterCard({
      metadata: {
        platform: 'twitter',
        processing: true,
        enrichmentStage: 'analyzing',
        enrichmentTiming: {
          startedAt: Date.now() - 3000,
          estimatedTotalMs: 8000,
          platform: 'twitter',
        },
      },
      tags: [],
    }),
    index: 2,
  },
}

export const WithActions: Story = {
  args: {
    card: createTwitterCard(),
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

export const Minimal: Story = {
  args: {
    card: createTwitterCard({
      title: null,
      content: 'Just a tweet with no image or tags.',
      imageUrl: null,
      tags: [],
      metadata: {
        platform: 'twitter',
        enrichmentStage: 'complete',
      },
    }),
  },
}
