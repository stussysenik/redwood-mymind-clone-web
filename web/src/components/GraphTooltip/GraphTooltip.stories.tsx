import type { Meta, StoryObj } from '@storybook/react'
import { GraphTooltip } from './GraphTooltip'

// GraphNode shape (mirrors src/lib/graph)
const mockNode = {
  id: 'node-1',
  title: 'Understanding Modern Web Architecture',
  type: 'article',
  tags: ['web', 'architecture', 'frontend', 'react'],
  connections: 5,
}

const meta: Meta<typeof GraphTooltip> = {
  title: 'Components/GraphTooltip',
  component: GraphTooltip,
  decorators: [
    (Story) => (
      <div style={{ height: 200, position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof GraphTooltip>

export const ArticleNode: Story = {
  args: {
    node: mockNode as any,
    position: { x: 20, y: 60 },
  },
}

export const VideoNode: Story = {
  args: {
    node: {
      ...mockNode,
      id: 'node-2',
      title: 'Building a Full-Stack App with RedwoodJS',
      type: 'video',
      tags: ['redwoodjs', 'tutorial', 'fullstack'],
      connections: 3,
    } as any,
    position: { x: 20, y: 60 },
  },
}

export const BookNode: Story = {
  args: {
    node: {
      ...mockNode,
      id: 'node-3',
      title: 'Project Hail Mary',
      type: 'book',
      tags: ['sci-fi', 'fiction', 'space', 'andy-weir', 'adventure'],
      connections: 8,
    } as any,
    position: { x: 20, y: 60 },
  },
}

export const ManyTagsNode: Story = {
  args: {
    node: {
      ...mockNode,
      id: 'node-4',
      title: 'Interstellar — Film Analysis',
      type: 'movie',
      tags: ['sci-fi', 'space', 'nolan', 'film', 'drama', 'award-winning', 'classic'],
      connections: 12,
    } as any,
    position: { x: 20, y: 60 },
  },
}

export const Null: Story = {
  args: {
    node: null,
    position: null,
  },
}
