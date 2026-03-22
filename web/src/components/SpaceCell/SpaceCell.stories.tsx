import type { Meta, StoryObj } from '@storybook/react'
import { Loading, Empty, Failure, Success } from './SpaceCell'
import { standard, smartSpace } from './SpaceCell.mock'

const meta: Meta = {
  title: 'Cells/SpaceCell',
}
export default meta

export const loading: StoryObj = {
  render: () => <Loading />,
}

export const empty: StoryObj = {
  render: () => <Empty />,
}

export const failure: StoryObj = {
  render: () => <Failure error={new Error('Space not found')} />,
}

export const success: StoryObj = {
  render: () => <Success {...standard()} />,
}

export const successSmartSpace: StoryObj = {
  render: () => <Success {...smartSpace()} />,
}
