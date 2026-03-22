import type { Meta, StoryObj } from '@storybook/react'
import { Loading, Empty, Failure, Success } from './GraphCell'
import { standard, sparse } from './GraphCell.mock'

const meta: Meta = {
  title: 'Cells/GraphCell',
}
export default meta

export const loading: StoryObj = {
  render: () => <Loading />,
}

export const empty: StoryObj = {
  render: () => <Empty />,
}

export const failure: StoryObj = {
  render: () => <Failure error={new Error('Graph data unavailable')} />,
}

export const success: StoryObj = {
  render: () => <Success {...standard()} />,
}

export const successSparse: StoryObj = {
  render: () => <Success {...sparse()} />,
}
