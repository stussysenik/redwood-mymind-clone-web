import type { Meta, StoryObj } from '@storybook/react'
import { Loading, Empty, Failure, Success } from './SerendipityCell'
import { standard, singleCard } from './SerendipityCell.mock'

const meta: Meta = {
  title: 'Cells/SerendipityCell',
}
export default meta

export const loading: StoryObj = {
  render: () => <Loading />,
}

export const empty: StoryObj = {
  render: () => <Empty />,
}

export const failure: StoryObj = {
  render: () => <Failure error={new Error('Could not load random cards')} />,
}

export const success: StoryObj = {
  render: () => <Success {...(standard() as any)} limit={5} />,
}

export const successSingleCard: StoryObj = {
  render: () => <Success {...(singleCard() as any)} limit={1} />,
}
