import type { Meta, StoryObj } from '@storybook/react'
import { AmazonCard } from './AmazonCard'
import { createAmazonCard } from 'src/mocks/cardFactory'

const meta: Meta<typeof AmazonCard> = {
  title: 'Cards/AmazonCard',
  component: AmazonCard,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof AmazonCard>

export const Default: Story = {
  args: {
    card: createAmazonCard(),
    index: 0,
  },
}

export const WithoutImage: Story = {
  args: {
    card: createAmazonCard({ imageUrl: null }),
    index: 1,
  },
}

export const Processing: Story = {
  args: {
    card: createAmazonCard({
      metadata: {
        platform: 'amazon',
        processing: true,
        enrichmentStage: 'analyzing',
        enrichmentTiming: {
          startedAt: Date.now() - 3000,
          estimatedTotalMs: 8000,
          platform: 'amazon',
        },
      },
      tags: [],
    }),
    index: 2,
  },
}

export const WithActions: Story = {
  args: {
    card: createAmazonCard(),
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

export const Minimal: Story = {
  args: {
    card: createAmazonCard({
      title: 'Generic Product',
      content: null,
      imageUrl: null,
      tags: [],
      metadata: {
        platform: 'amazon',
        enrichmentStage: 'complete',
      },
    }),
  },
}
