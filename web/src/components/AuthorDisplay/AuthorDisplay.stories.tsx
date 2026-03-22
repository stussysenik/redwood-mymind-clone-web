import type { Meta, StoryObj } from '@storybook/react'
import { AuthorDisplay } from './AuthorDisplay'

const meta: Meta<typeof AuthorDisplay> = {
  title: 'Components/AuthorDisplay',
  component: AuthorDisplay,
}
export default meta
type Story = StoryObj<typeof AuthorDisplay>

export const Default: Story = {
  args: {
    name: 'Jane Developer',
    handle: 'janedeveloper',
    size: 'md',
    platform: 'default',
    showAtSymbol: true,
  },
}

export const WithAvatar: Story = {
  args: {
    name: 'Elon Musk',
    handle: 'elonmusk',
    avatarUrl: 'https://picsum.photos/seed/avatar1/48/48',
    size: 'md',
    platform: 'twitter',
  },
}

export const TwitterLarge: Story = {
  args: {
    name: 'Fireship',
    handle: 'Fireship',
    avatarUrl: 'https://picsum.photos/seed/ytavatar/48/48',
    size: 'lg',
    platform: 'twitter',
  },
}

export const RedditWithPrefix: Story = {
  args: {
    name: 'u/science_enthusiast',
    handle: 'science_enthusiast',
    size: 'sm',
    platform: 'reddit',
    showAtSymbol: false,
    handlePrefix: 'u/',
  },
}

export const NoAvatar: Story = {
  args: {
    name: 'Nature Photography',
    handle: 'naturephoto',
    size: 'md',
    platform: 'instagram',
  },
}
