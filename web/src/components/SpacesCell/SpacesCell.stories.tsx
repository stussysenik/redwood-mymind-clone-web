import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'
import { Loading, Empty, Failure, Success } from './SpacesCell'
import { standard, singleSpace } from './SpacesCell.mock'

// SpacesCell Success uses Link + routes from @redwoodjs/router, which requires
// a router context. Wrapping with MemoryRouter satisfies that requirement.
const meta: Meta = {
  title: 'Cells/SpacesCell',
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
}
export default meta

export const loading: StoryObj = {
  render: () => <Loading />,
}

export const empty: StoryObj = {
  render: () => <Empty />,
}

export const failure: StoryObj = {
  render: () => <Failure error={new Error('Could not load spaces')} />,
}

export const success: StoryObj = {
  render: () => <Success {...standard()} />,
}

export const successSingleSpace: StoryObj = {
  render: () => <Success {...singleSpace()} />,
}
