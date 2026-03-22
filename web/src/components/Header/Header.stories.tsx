import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'

import { Header } from './Header'

const meta: Meta<typeof Header> = {
  title: 'Components/Header',
  component: Header,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof Header>

export const Default: Story = {}

export const WithBuildVersion: Story = {
  args: {
    buildVersion: '1.2.3',
  },
}

export const DevBuild: Story = {
  args: {
    buildVersion: 'dev',
  },
}
