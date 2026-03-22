import type { Meta, StoryObj } from '@storybook/react'
import { RedditCard } from './RedditCard'
import { createRedditCard } from 'src/mocks/cardFactory'

const meta: Meta<typeof RedditCard> = {
  title: 'Cards/RedditCard',
  component: RedditCard,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof RedditCard>

export const Default: Story = {
  args: {
    card: createRedditCard(),
    index: 0,
  },
}

export const WithoutImage: Story = {
  args: {
    card: createRedditCard({ imageUrl: null }),
    index: 1,
  },
}

export const Processing: Story = {
  args: {
    card: createRedditCard({
      metadata: {
        platform: 'reddit',
        processing: true,
        enrichmentStage: 'analyzing',
        enrichmentTiming: {
          startedAt: Date.now() - 3000,
          estimatedTotalMs: 8000,
          platform: 'reddit',
        },
      },
      tags: [],
    }),
    index: 2,
  },
}

export const WithActions: Story = {
  args: {
    card: createRedditCard(),
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

export const Minimal: Story = {
  args: {
    card: createRedditCard({
      title: 'A minimal Reddit post',
      content: null,
      imageUrl: null,
      tags: [],
      metadata: {
        platform: 'reddit',
        subreddit: 'r/minimalism',
        enrichmentStage: 'complete',
      },
    }),
  },
}
