import type { Meta, StoryObj } from '@storybook/react'
import { FocusCard } from './FocusCard'
import {
  createMockCard,
  createYouTubeCard,
  createArticleCard,
  createNoteCard,
  createImageCard,
} from 'src/mocks/cardFactory'

const meta: Meta<typeof FocusCard> = {
  title: 'Components/FocusCard',
  component: FocusCard,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof FocusCard>

export const ArticleWithImage: Story = {
  args: {
    card: createArticleCard(),
    onOpenDetail: () => console.log('open detail'),
    isAnimating: false,
  },
}

export const VideoCard: Story = {
  args: {
    card: createYouTubeCard(),
    onOpenDetail: () => console.log('open detail'),
    isAnimating: false,
  },
}

export const ImageCard: Story = {
  args: {
    card: createImageCard(),
    onOpenDetail: () => console.log('open detail'),
    isAnimating: false,
  },
}

export const NoteCard: Story = {
  args: {
    card: createNoteCard(),
    onOpenDetail: () => console.log('open detail'),
    isAnimating: false,
  },
}

export const CardWithColorPalette: Story = {
  args: {
    card: createMockCard({
      title: 'Design System — Minimal Dashboard',
      imageUrl: 'https://picsum.photos/seed/img1/800/600',
      metadata: {
        summary: 'A beautiful minimal dashboard design with a clean color palette.',
        colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
        enrichmentStage: 'complete',
      },
      tags: ['design', 'ui', 'dashboard', 'colors'],
    }),
    onOpenDetail: () => console.log('open detail'),
    isAnimating: false,
  },
}
