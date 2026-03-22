import type { Meta, StoryObj } from '@storybook/react'
import { Loading, Empty, Failure, Success } from './CardsCell'
import { standard, withPagination } from './CardsCell.mock'

const meta: Meta = {
  title: 'Cells/CardsCell',
}
export default meta

export const loading: StoryObj = {
  render: () => <Loading />,
}

export const empty: StoryObj = {
  render: () => <Empty />,
}

export const failure: StoryObj = {
  render: () => <Failure error={new Error('Could not load cards')} />,
}

export const success: StoryObj = {
  render: () => <Success {...standard()} />,
}

export const successWithPagination: StoryObj = {
  render: () => <Success {...withPagination()} />,
}
