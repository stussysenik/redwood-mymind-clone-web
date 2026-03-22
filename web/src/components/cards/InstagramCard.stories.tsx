import type { Meta, StoryObj } from '@storybook/react'
import { InstagramCard } from './InstagramCard'
import { createInstagramCard } from 'src/mocks/cardFactory'

const meta: Meta<typeof InstagramCard> = {
  title: 'Cards/InstagramCard',
  component: InstagramCard,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof InstagramCard>

export const Default: Story = {
  args: {
    card: createInstagramCard(),
    index: 0,
  },
}

export const WithoutImage: Story = {
  args: {
    card: createInstagramCard({ imageUrl: null }),
    index: 1,
  },
}

export const Processing: Story = {
  args: {
    card: createInstagramCard({
      metadata: {
        platform: 'instagram',
        processing: true,
        enrichmentStage: 'analyzing',
        enrichmentTiming: {
          startedAt: Date.now() - 3000,
          estimatedTotalMs: 8000,
          platform: 'instagram',
        },
      },
      tags: [],
    }),
    index: 2,
  },
}

export const WithActions: Story = {
  args: {
    card: createInstagramCard(),
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

export const Minimal: Story = {
  args: {
    card: createInstagramCard({
      title: null,
      content: 'Beautiful sunset captured today.',
      imageUrl: null,
      tags: [],
      metadata: {
        platform: 'instagram',
        enrichmentStage: 'complete',
        isCarousel: false,
      },
    }),
  },
}
