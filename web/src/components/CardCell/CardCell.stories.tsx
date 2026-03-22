import type { Meta, StoryObj } from '@storybook/react'
import { Loading, Empty, Failure, Success } from './CardCell'
import { standard, withNote } from './CardCell.mock'

const meta: Meta = {
  title: 'Cells/CardCell',
}
export default meta

export const loading: StoryObj = {
  render: () => <Loading />,
}

export const empty: StoryObj = {
  render: () => <Empty />,
}

export const failure: StoryObj = {
  render: () => <Failure error={new Error('Card not found')} />,
}

export const success: StoryObj = {
  render: () => <Success {...(standard() as any)} id="mock-card-1" />,
}

export const successNote: StoryObj = {
  render: () => <Success {...(withNote() as any)} id="mock-card-2" />,
}
