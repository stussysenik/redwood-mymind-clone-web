import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'

import { createMockCard, createTwitterCard, createImageCard, createNoteCard } from 'src/mocks/cardFactory'

import { CardDetailModal } from './CardDetailModal'

// CardDetailModal uses navigate from @redwoodjs/router and useMutation from
// @redwoodjs/web. useMutation calls may fail in isolation but the component
// still renders its visual shell correctly.

const meta: Meta<typeof CardDetailModal> = {
  title: 'Components/CardDetailModal',
  component: CardDetailModal,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof CardDetailModal>

/** Article card — standard layout with title, summary and tags. */
export const ArticleCard: Story = {
  args: {
    card: createMockCard(),
    isOpen: true,
    onClose: () => console.log('onClose'),
    onDelete: (id: string) => console.log('onDelete', id),
    onArchive: (id: string) => console.log('onArchive', id),
    availableSpaces: ['design', 'reading', 'tech'],
  },
}

/** Tweet card — social layout with author details. */
export const TwitterCard: Story = {
  args: {
    card: createTwitterCard(),
    isOpen: true,
    onClose: () => console.log('onClose'),
  },
}

/** Image card — full bleed image with color palette. */
export const ImageCard: Story = {
  args: {
    card: createImageCard(),
    isOpen: true,
    onClose: () => console.log('onClose'),
  },
}

/** Note card — text-only content, no image. */
export const NoteCard: Story = {
  args: {
    card: createNoteCard(),
    isOpen: true,
    onClose: () => console.log('onClose'),
  },
}

/** Closed state — renders nothing. */
export const Closed: Story = {
  args: {
    card: createMockCard(),
    isOpen: false,
    onClose: () => console.log('onClose'),
  },
}
