import type { Meta, StoryObj } from '@storybook/react'
import { Loading, Empty, Failure, Success } from './SearchCell'
import { standard, singleResult } from './SearchCell.mock'

const meta: Meta = {
  title: 'Cells/SearchCell',
}
export default meta

export const loading: StoryObj = {
  render: () => <Loading />,
}

export const empty: StoryObj = {
  render: () => <Empty />,
}

export const failure: StoryObj = {
  render: () => <Failure error={new Error('Search service unavailable')} />,
}

export const success: StoryObj = {
  render: () => <Success {...(standard() as any)} query="test" />,
}

export const successSingleResult: StoryObj = {
  render: () => <Success {...(singleResult() as any)} query="article" />,
}
