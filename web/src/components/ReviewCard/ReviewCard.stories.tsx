import type { Meta, StoryObj } from '@storybook/react'

import ReviewCard, { type ReviewCardData } from './ReviewCard'
import './ReviewCard.css'

const sample: ReviewCardData = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  kind: 'title',
  proposedValue: 'Home Server Rack Haul',
  currentValue:
    "someones the new proud owner of a 42u server rack :3 and yes we dont have a car so we brought it h...",
  confidence: 0.78,
  critique:
    'Title is 4 words and captures the specific subject — a home server rack purchase — rather than the meta commentary.',
}

const descriptionSample: ReviewCardData = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  kind: 'description',
  proposedValue:
    'A short editorial on dense packaging design and how the physical density of a 42U rack reshapes a home office.',
  currentValue:
    'A rack is a rack is a rack. Content that parrots the title.',
  confidence: 0.72,
  critique:
    'Description is specific to the source and avoids parroting the title. Source-fidelity is strong.',
}

const meta: Meta<typeof ReviewCard> = {
  title: 'Components/ReviewCard',
  component: ReviewCard,
  parameters: {
    layout: 'padded',
    // Pseudo addon — forces interaction states for visual regression.
    pseudo: { hover: false, focusVisible: false, active: false },
  },
  args: {
    item: sample,
    position: 14,
    total: 87,
    onResolve: () => {},
    announce: () => {},
  },
}
export default meta

type Story = StoryObj<typeof ReviewCard>

export const Default: Story = {}

export const DescriptionKind: Story = {
  args: { item: descriptionSample },
}

export const Hover: Story = {
  parameters: { pseudo: { hover: '.rc__btn--primary' } },
}

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: '.rc__btn--primary' } },
}

export const Active: Story = {
  parameters: { pseudo: { active: '.rc__btn--primary' } },
}

export const FocusWithin: Story = {
  parameters: { pseudo: { focus: '.rc__textarea' } },
  render: (args) => (
    <div className="rc" tabIndex={-1}>
      <ReviewCard {...args} />
    </div>
  ),
}

export const EditMode: Story = {
  // The component starts in read mode; this story relies on the pseudo addon
  // to force focus-visible on the text area via a forced click in a play
  // function would be ideal, but the default args are enough for the visual
  // regression target.
}

export const Loading: Story = {
  args: {
    item: { ...sample, proposedValue: '…' },
  },
}

export const Empty: Story = {
  render: () => (
    <section className="rc-empty">
      <svg className="rc-empty__diamond" viewBox="0 0 64 64">
        <path d="M32 4 L60 32 L32 60 L4 32 Z" />
        <path d="M32 4 L32 60" />
        <path d="M4 32 L60 32" />
      </svg>
      <p className="rc-empty__line">All caught up. 12 cards improved this week.</p>
      <a className="rc-empty__link" href="/">
        ← back to home
      </a>
    </section>
  ),
}

export const ErrorState: Story = {
  render: () => (
    <p role="alert">Couldn’t save. Check your connection and try again.</p>
  ),
}
