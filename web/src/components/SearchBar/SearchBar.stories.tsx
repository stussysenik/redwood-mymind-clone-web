import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'

import { SearchBar } from './SearchBar'

const meta: Meta<typeof SearchBar> = {
  title: 'Components/SearchBar',
  component: SearchBar,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: 600, padding: 16 }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof SearchBar>

export const Default: Story = {}

export const WithCustomPlaceholder: Story = {
  args: {
    placeholder: 'Search your creative brain...',
  },
}

export const WithSearchCallback: Story = {
  args: {
    placeholder: 'Try searching something...',
    onSearch: (query: string) => console.log('Search:', query),
  },
}
