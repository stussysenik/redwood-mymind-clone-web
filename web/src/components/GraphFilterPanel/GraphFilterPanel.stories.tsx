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
  initialMinWeight = 1,
  nodeCount = 42,
  edgeCount = 87,
  orphanCount = 9,
}: {
  initialMinWeight?: number
  nodeCount?: number
  edgeCount?: number
  orphanCount?: number
}) {
  const [minWeight, setMinWeight] = useState(initialMinWeight)

  return (
    <div style={{ position: 'relative', height: 300, width: 400 }}>
      <GraphFilterPanel
        minWeight={minWeight}
        onMinWeightChange={setMinWeight}
        nodeCount={nodeCount}
        edgeCount={edgeCount}
        orphanCount={orphanCount}
        onReset={() => {
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
      initialMinWeight={2}
      nodeCount={14}
      edgeCount={23}
      orphanCount={2}
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
    <ControlledFilterPanel nodeCount={312} edgeCount={748} orphanCount={41} />
  ),
}
