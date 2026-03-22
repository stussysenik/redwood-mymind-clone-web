import type { Meta, StoryObj } from '@storybook/react'
import { YouTubeCard } from './YouTubeCard'
import { createYouTubeCard } from 'src/mocks/cardFactory'

const meta: Meta<typeof YouTubeCard> = {
  title: 'Cards/YouTubeCard',
  component: YouTubeCard,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof YouTubeCard>

export const Default: Story = {
  args: {
    card: createYouTubeCard(),
    index: 0,
  },
}

export const WithoutImage: Story = {
  args: {
    card: createYouTubeCard({ imageUrl: null }),
    index: 1,
  },
}

export const Processing: Story = {
  args: {
    card: createYouTubeCard({
      metadata: {
        platform: 'youtube',
        processing: true,
        enrichmentStage: 'analyzing',
        enrichmentTiming: {
          startedAt: Date.now() - 3000,
          estimatedTotalMs: 8000,
          platform: 'youtube',
        },
      },
      tags: [],
    }),
    index: 2,
  },
}

export const WithActions: Story = {
  args: {
    card: createYouTubeCard(),
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

export const Minimal: Story = {
  args: {
    card: createYouTubeCard({
      title: 'Short video title',
      content: null,
      imageUrl: null,
      tags: [],
      metadata: {
        platform: 'youtube',
        enrichmentStage: 'complete',
      },
    }),
  },
}
