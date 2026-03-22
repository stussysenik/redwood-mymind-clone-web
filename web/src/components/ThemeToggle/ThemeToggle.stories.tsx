import type { Meta, StoryObj } from '@storybook/react'

import { ThemeToggle } from './ThemeToggle'

// ThemeToggle relies on useTheme which is provided by the global ThemeProvider decorator
// in .storybook/preview.tsx — no extra wrapper needed.

const meta: Meta<typeof ThemeToggle> = {
  title: 'Components/ThemeToggle',
  component: ThemeToggle,
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof ThemeToggle>

export const Default: Story = {}

export const WithLabel: Story = {
  args: {
    showLabel: true,
  },
}

export const WithCustomClass: Story = {
  args: {
    className: 'border border-dashed',
  },
}
