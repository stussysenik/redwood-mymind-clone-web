import type { Meta, StoryObj } from '@storybook/react'
import { LetterboxdCard } from './LetterboxdCard'
import { createLetterboxdCard } from 'src/mocks/cardFactory'

const meta: Meta<typeof LetterboxdCard> = {
  title: 'Cards/LetterboxdCard',
  component: LetterboxdCard,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof LetterboxdCard>

export const Default: Story = {
  args: {
    card: createLetterboxdCard(),
    index: 0,
  },
}

export const WithoutImage: Story = {
  args: {
    card: createLetterboxdCard({ imageUrl: null }),
    index: 1,
  },
}

export const Processing: Story = {
  args: {
    card: createLetterboxdCard({
      metadata: {
        platform: 'letterboxd',
        processing: true,
        enrichmentStage: 'analyzing',
        enrichmentTiming: {
          startedAt: Date.now() - 3000,
          estimatedTotalMs: 8000,
          platform: 'letterboxd',
        },
      },
      tags: [],
    }),
    index: 2,
  },
}

export const WithActions: Story = {
  args: {
    card: createLetterboxdCard(),
    onDelete: () => console.log('delete'),
    onArchive: () => console.log('archive'),
    onRestore: () => console.log('restore'),
    onClick: () => console.log('click'),
  },
}

export const Minimal: Story = {
  args: {
    card: createLetterboxdCard({
      title: 'Some Film',
      content: null,
      imageUrl: null,
      tags: [],
      metadata: {
        platform: 'letterboxd',
        enrichmentStage: 'complete',
      },
    }),
  },
}
