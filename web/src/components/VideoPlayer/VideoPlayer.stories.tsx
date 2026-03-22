import type { Meta, StoryObj } from '@storybook/react'
import { VideoPlayer, VideoPlayerCompact } from './VideoPlayer'

const meta: Meta<typeof VideoPlayer> = {
  title: 'Components/VideoPlayer',
  component: VideoPlayer,
}
export default meta
type Story = StoryObj<typeof VideoPlayer>

export const YouTubeWithThumbnail: Story = {
  args: {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thumbnail: 'https://picsum.photos/seed/yt1/640/360',
    title: 'Building a Full-Stack App with RedwoodJS',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
}

export const YouTubeNoThumbnail: Story = {
  args: {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Building a Full-Stack App with RedwoodJS',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
}

export const Fallback: Story = {
  args: {
    url: 'https://example.com/not-embeddable-video.mp4',
    thumbnail: 'https://picsum.photos/seed/vid1/640/360',
    title: 'Non-embeddable video',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
}

export const Compact: StoryObj<typeof VideoPlayerCompact> = {
  render: () => (
    <div style={{ maxWidth: 320 }}>
      <VideoPlayerCompact
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        thumbnail="https://picsum.photos/seed/yt1/640/360"
        onClick={() => console.log('compact player clicked')}
      />
    </div>
  ),
}

export const CompactNoThumbnail: StoryObj<typeof VideoPlayerCompact> = {
  render: () => (
    <div style={{ maxWidth: 320 }}>
      <VideoPlayerCompact
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        onClick={() => console.log('compact player clicked')}
      />
    </div>
  ),
}
