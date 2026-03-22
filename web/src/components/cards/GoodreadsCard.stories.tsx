import type { Meta, StoryObj } from '@storybook/react'
import { GoodreadsCard } from './GoodreadsCard'
import { createGoodreadsCard } from 'src/mocks/cardFactory'

const meta: Meta<typeof GoodreadsCard> = {
  title: 'Cards/GoodreadsCard',
  component: GoodreadsCard,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof GoodreadsCard>

export const Default: Story = {
  args: {
    card: createGoodreadsCard(),
    index: 0,
  },
}

export const WithoutImage: Story = {
  args: {
    card: createGoodreadsCard({ imageUrl: null }),
    index: 1,
  },
}

export const Processing: Story = {
  args: {
    card: createGoodreadsCard({
      metadata: {
        processing: true,
        enrichmentStage: 'analyzing',
        enrichmentTiming: {
          startedAt: Date.now() - 3000,
          estimatedTotalMs: 8000,
          platform: 'goodreads',
        },
      },
      tags: [],
    }),
    index: 2,
  },
}

export const WithActions: Story = {
  args: {
    card: createGoodreadsCard(),
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

export const Minimal: Story = {
  args: {
    card: createGoodreadsCard({
      title: 'A Book',
      content: null,
      imageUrl: null,
      tags: [],
      metadata: {
        enrichmentStage: 'complete',
      },
    }),
  },
}
