import type { Meta, StoryObj } from '@storybook/react'

import { SpaceCard } from './SpaceCard'

// SpaceCard renders an <a> tag but does not use @redwoodjs/router Link —
// MemoryRouter is not required.

const meta: Meta<typeof SpaceCard> = {
  title: 'Components/SpaceCard',
  component: SpaceCard,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 300 }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SpaceCard>

/** Single item count. */
export const OneItem: Story = {
  args: {
    tag: 'design',
    count: 1,
    onHide: (tag: string) => console.log('hide', tag),
    onDelete: () => console.log('delete'),
  },
}

/** Many items. */
export const ManyItems: Story = {
  args: {
    tag: 'architecture',
    count: 47,
    onHide: (tag: string) => console.log('hide', tag),
    onDelete: () => console.log('delete'),
  },
}

/** Without action callbacks — no hide/delete buttons shown. */
export const ReadOnly: Story = {
  args: {
    tag: 'reading',
    count: 12,
  },
}

/** Long tag name — truncation check. */
export const LongTagName: Story = {
  args: {
    tag: 'machine-learning-and-artificial-intelligence',
    count: 23,
    onHide: (tag: string) => console.log('hide', tag),
  },
}
