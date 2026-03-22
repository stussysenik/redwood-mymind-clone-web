import type { Meta, StoryObj } from '@storybook/react'
import { Card } from './Card'
import {
  createMockCard,
  createTwitterCard,
  createYouTubeCard,
  createArticleCard,
  createNoteCard,
  createImageCard,
  createMovieCard,
  createRedditCard,
  createInstagramCard,
  createAmazonCard,
  createGoodreadsCard,
  createProcessingCard,
} from 'src/mocks/cardFactory'

const meta: Meta<typeof Card> = {
  title: 'Cards/Card',
  component: Card,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof Card>

// Generic / Article (falls through to GenericCard renderer)
export const Article: Story = {
  args: {
    card: createArticleCard(),
    index: 0,
  },
}

// Note card — renders inline text, no image
export const Note: Story = {
  args: {
    card: createNoteCard(),
    index: 1,
  },
}

// Twitter — lazy-loads TwitterCard via Suspense
export const Twitter: Story = {
  args: {
    card: createTwitterCard(),
    index: 2,
  },
}

// YouTube — lazy-loads YouTubeCard via Suspense
export const YouTube: Story = {
  args: {
    card: createYouTubeCard(),
    index: 3,
  },
}

// Movie (IMDB) — lazy-loads MovieCard via Suspense
export const Movie: Story = {
  args: {
    card: createMovieCard(),
    index: 4,
  },
}

// Reddit — lazy-loads RedditCard via Suspense
export const Reddit: Story = {
  args: {
    card: createRedditCard(),
    index: 5,
  },
}

// Instagram — lazy-loads InstagramCard via Suspense
export const Instagram: Story = {
  args: {
    card: createInstagramCard(),
    index: 6,
  },
}

// Amazon product — lazy-loads AmazonCard via Suspense
export const Amazon: Story = {
  args: {
    card: createAmazonCard(),
    index: 7,
  },
}

// Book (Goodreads) — lazy-loads GoodreadsCard via Suspense
export const Book: Story = {
  args: {
    card: createGoodreadsCard(),
    index: 8,
  },
}

// Image-only card, no URL
export const ImageCard: Story = {
  args: {
    card: createImageCard(),
    index: 9,
  },
}

// Generic card with no image — shows gradient + type icon placeholder
export const GenericNoImage: Story = {
  args: {
    card: createMockCard({ imageUrl: null }),
    index: 10,
  },
}

// Processing state — enrichment still in progress
export const Processing: Story = {
  args: {
    card: createProcessingCard(),
    index: 11,
  },
}

// With all action buttons visible
export const WithActions: Story = {
  args: {
    card: createArticleCard(),
    index: 0,
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

// Trash view — restore action only
export const TrashView: Story = {
  args: {
    card: createArticleCard(),
    index: 0,
    onRestore: () => console.log('restore'),
    onDelete: () => console.log('delete'),
  },
}
