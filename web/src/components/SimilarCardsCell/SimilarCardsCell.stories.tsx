import type { Meta, StoryObj } from '@storybook/react'
import { Loading, Empty, Failure, Success } from './SimilarCardsCell'
import { standard, singleMatch } from './SimilarCardsCell.mock'

const meta: Meta = {
  title: 'Cells/SimilarCardsCell',
}
export default meta

export const loading: StoryObj = {
  render: () => <Loading />,
}

export const empty: StoryObj = {
  render: () => <Empty />,
}

export const failure: StoryObj = {
  render: () => <Failure error={new Error('Vector search unavailable')} />,
}

export const success: StoryObj = {
  render: () => <Success {...(standard() as any)} />,
}

export const successSingleMatch: StoryObj = {
  render: () => <Success {...(singleMatch() as any)} />,
}
