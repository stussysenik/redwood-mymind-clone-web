import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { GraphFilterPanel } from './GraphFilterPanel'

const meta: Meta<typeof GraphFilterPanel> = {
  title: 'Components/GraphFilterPanel',
  component: GraphFilterPanel,
}
export default meta
type Story = StoryObj<typeof GraphFilterPanel>

// Controlled wrapper for interactive stories
function ControlledFilterPanel({
  initialTagFilter = '',
  initialMinWeight = 1,
  nodeCount = 42,
  edgeCount = 87,
}: {
  initialTagFilter?: string
  initialMinWeight?: number
  nodeCount?: number
  edgeCount?: number
}) {
  const [tagFilter, setTagFilter] = useState(initialTagFilter)
  const [minWeight, setMinWeight] = useState(initialMinWeight)

  return (
    <div style={{ position: 'relative', height: 300, width: 400 }}>
      <GraphFilterPanel
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
        minWeight={minWeight}
        onMinWeightChange={setMinWeight}
        nodeCount={nodeCount}
        edgeCount={edgeCount}
        onReset={() => {
          setTagFilter('')
          setMinWeight(1)
        }}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <ControlledFilterPanel />,
}

export const WithActiveFilter: Story = {
  render: () => (
    <ControlledFilterPanel
      initialTagFilter="react"
      initialMinWeight={2}
      nodeCount={14}
      edgeCount={23}
    />
  ),
}

export const HighMinWeight: Story = {
  render: () => (
    <ControlledFilterPanel
      initialMinWeight={4}
      nodeCount={8}
      edgeCount={11}
    />
  ),
}

export const LargeGraph: Story = {
  render: () => (
    <ControlledFilterPanel nodeCount={312} edgeCount={748} />
  ),
}
