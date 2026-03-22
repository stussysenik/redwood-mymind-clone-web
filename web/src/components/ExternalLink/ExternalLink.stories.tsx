import type { Meta, StoryObj } from '@storybook/react'
import { ExternalLink, ExternalLinkButton, PlatformLink } from './ExternalLink'

const meta: Meta<typeof ExternalLink> = {
  title: 'Components/ExternalLink',
  component: ExternalLink,
}
export default meta
type Story = StoryObj<typeof ExternalLink>

export const Default: Story = {
  args: {
    url: 'https://example.com/article',
    children: 'Read the full article',
    showIcon: true,
  },
}

export const WithoutIcon: Story = {
  args: {
    url: 'https://github.com',
    children: 'Visit GitHub',
    showIcon: false,
  },
}

export const LargeIcon: Story = {
  args: {
    url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
    children: 'Watch on YouTube',
    showIcon: true,
    iconSize: 'lg',
  },
}

export const ButtonDefault: StoryObj<typeof ExternalLinkButton> = {
  render: () => (
    <ExternalLinkButton url="https://example.com" variant="default">
      Open Link
    </ExternalLinkButton>
  ),
}

export const ButtonPrimary: StoryObj<typeof ExternalLinkButton> = {
  render: () => (
    <ExternalLinkButton url="https://example.com" variant="primary" size="lg">
      Open in New Tab
    </ExternalLinkButton>
  ),
}

export const PlatformLinkTwitter: StoryObj<typeof PlatformLink> = {
  render: () => (
    <PlatformLink url="https://x.com/elonmusk/status/1234567890" />
  ),
}

export const PlatformLinkYouTube: StoryObj<typeof PlatformLink> = {
  render: () => (
    <PlatformLink url="https://youtube.com/watch?v=dQw4w9WgXcQ" />
  ),
}
