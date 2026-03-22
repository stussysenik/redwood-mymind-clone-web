import type { Meta, StoryObj } from '@storybook/react'
import { CardActions, ExternalLinkButton } from './CardActions'

const meta: Meta<typeof CardActions> = {
  title: 'Cards/CardActions',
  component: CardActions,
}
export default meta
type Story = StoryObj<typeof CardActions>

export const Default: Story = {
  args: {
    isHovered: true,
    onArchive: () => console.log('archive'),
    onDelete: () => console.log('delete'),
    variant: 'light',
  },
  decorators: [
    (Story) => (
      <div className="relative w-64 h-40 bg-white rounded-xl border shadow-sm">
        <Story />
      </div>
    ),
  ],
}

export const DarkVariant: Story = {
  args: {
    isHovered: true,
    onArchive: () => console.log('archive'),
    onDelete: () => console.log('delete'),
    variant: 'dark',
  },
  decorators: [
    (Story) => (
      <div className="relative w-64 h-40 bg-gray-800 rounded-xl">
        <Story />
      </div>
    ),
  ],
}

export const WithRestore: Story = {
  args: {
    isHovered: true,
    onRestore: () => console.log('restore'),
    onDelete: () => console.log('delete'),
    variant: 'light',
  },
  decorators: [
    (Story) => (
      <div className="relative w-64 h-40 bg-white rounded-xl border shadow-sm">
        <Story />
      </div>
    ),
  ],
}

export const Hidden: Story = {
  args: {
    isHovered: false,
    onArchive: () => console.log('archive'),
    onDelete: () => console.log('delete'),
  },
  decorators: [
    (Story) => (
      <div className="relative w-64 h-40 bg-white rounded-xl border shadow-sm">
        <p className="p-4 text-sm text-gray-400">Hover actions hidden</p>
        <Story />
      </div>
    ),
  ],
}

export const ExternalLinkBottomRight: StoryObj<typeof ExternalLinkButton> = {
  render: () => (
    <div className="relative w-64 h-40 bg-white rounded-xl border shadow-sm">
      <ExternalLinkButton
        url="https://example.com/article"
        variant="light"
        position="bottom-right"
      />
    </div>
  ),
}

export const ExternalLinkBottomLeft: StoryObj<typeof ExternalLinkButton> = {
  render: () => (
    <div className="relative w-64 h-40 bg-gray-800 rounded-xl">
      <ExternalLinkButton
        url="https://youtube.com/watch?v=dQw4w9WgXcQ"
        variant="dark"
        position="bottom-left"
      />
    </div>
  ),
}
