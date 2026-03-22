import type { Meta, StoryObj } from '@storybook/react'

import { TagDisplay, TagShimmerPlaceholder } from './TagDisplay'

const meta: Meta<typeof TagDisplay> = {
  title: 'Components/TagDisplay',
  component: TagDisplay,
}

export default meta
type Story = StoryObj<typeof TagDisplay>

export const Default: Story = {
  args: {
    tags: ['design', 'frontend', 'react'],
  },
}

export const ManyTags: Story = {
  args: {
    tags: [
      'design',
      'frontend',
      'react',
      'typescript',
      'css',
      'animation',
      'ui',
      'accessibility',
      'performance',
      'testing',
    ],
  },
}

export const SingleTag: Story = {
  args: {
    tags: ['inspiration'],
  },
}

export const Empty: Story = {
  args: {
    tags: [],
  },
}

export const Shimmer: StoryObj<typeof TagShimmerPlaceholder> = {
  render: () => <TagShimmerPlaceholder />,
}
