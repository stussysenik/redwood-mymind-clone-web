import type { Meta, StoryObj } from '@storybook/react'
import { MovieCard } from './MovieCard'
import { createMovieCard } from 'src/mocks/cardFactory'

const meta: Meta<typeof MovieCard> = {
  title: 'Cards/MovieCard',
  component: MovieCard,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof MovieCard>

export const Default: Story = {
  args: {
    card: createMovieCard(),
    index: 0,
  },
}

export const WithoutImage: Story = {
  args: {
    card: createMovieCard({ imageUrl: null }),
    index: 1,
  },
}

export const Processing: Story = {
  args: {
    card: createMovieCard({
      metadata: {
        platform: 'imdb',
        processing: true,
        enrichmentStage: 'analyzing',
        enrichmentTiming: {
          startedAt: Date.now() - 3000,
          estimatedTotalMs: 8000,
          platform: 'imdb',
        },
      },
      tags: [],
    }),
    index: 2,
  },
}

export const WithActions: Story = {
  args: {
    card: createMovieCard(),
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

export const Minimal: Story = {
  args: {
    card: createMovieCard({
      title: 'Untitled Film',
      content: null,
      imageUrl: null,
      tags: [],
      metadata: {
        platform: 'imdb',
        enrichmentStage: 'complete',
      },
    }),
  },
}
