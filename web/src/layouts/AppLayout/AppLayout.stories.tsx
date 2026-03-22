import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'
import AppLayout from './AppLayout'

// AppLayout contains anchor tags that resolve against the router context.
// Wrap in MemoryRouter so the hrefs don't cause navigation warnings.
const meta: Meta<typeof AppLayout> = {
  title: 'Layouts/AppLayout',
  component: AppLayout,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/']}>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof AppLayout>

// ---------------------------------------------------------------------------
// Shared sample content
// ---------------------------------------------------------------------------

const PlaceholderContent = () => (
  <div className="px-6 py-8 max-w-4xl mx-auto space-y-4">
    <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
      Everything
    </h2>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border p-4 h-32 flex items-center justify-center text-sm"
          style={{
            background: 'var(--surface-card)',
            borderColor: 'var(--border)',
            color: 'var(--foreground-muted)',
          }}
        >
          Card {i + 1}
        </div>
      ))}
    </div>
  </div>
)

const LongContent = () => (
  <div className="px-6 py-8 max-w-4xl mx-auto space-y-4">
    {Array.from({ length: 20 }).map((_, i) => (
      <div
        key={i}
        className="rounded-xl border p-4 h-24 flex items-center"
        style={{
          background: 'var(--surface-card)',
          borderColor: 'var(--border)',
          color: 'var(--foreground-muted)',
        }}
      >
        Card row {i + 1} — scroll to see sticky header and mobile FAB behaviour
      </div>
    ))}
  </div>
)

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/**
 * Default layout showing the sticky header, desktop nav, mobile bottom bar,
 * and the floating action button with a short grid of placeholder cards.
 */
export const Default: Story = {
  args: {
    children: <PlaceholderContent />,
  },
}

/**
 * Scrollable content — demonstrates that the header stays sticky and the FAB
 * remains accessible above the mobile bottom nav while scrolling.
 */
export const WithScrollableContent: Story = {
  args: {
    children: <LongContent />,
  },
}

/**
 * Empty children — renders the chrome (header + nav + FAB) with no main content.
 * Useful for verifying layout geometry in isolation.
 */
export const EmptyContent: Story = {
  args: {
    children: null,
  },
}
