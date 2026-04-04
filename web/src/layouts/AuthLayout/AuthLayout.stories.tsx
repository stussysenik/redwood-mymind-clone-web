import type { Meta, StoryObj } from '@storybook/react'
import AuthLayout from './AuthLayout'

// AuthLayout has no router dependencies — plain render is sufficient.
const meta: Meta<typeof AuthLayout> = {
  title: 'Layouts/AuthLayout',
  component: AuthLayout,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof AuthLayout>

// ---------------------------------------------------------------------------
// Sample form children
// ---------------------------------------------------------------------------

const LoginForm = () => (
  <div className="space-y-4">
    <div>
      <label
        className="block text-sm font-medium mb-1"
        style={{ color: 'var(--foreground)' }}
        htmlFor="email"
      >
        Email
      </label>
      <input
        id="email"
        type="email"
        placeholder="you@example.com"
        className="w-full px-4 py-2.5 rounded-xl border text-sm"
        style={{
          background: 'var(--surface-card)',
          borderColor: 'var(--border)',
          color: 'var(--foreground)',
        }}
        readOnly
      />
    </div>
    <div>
      <label
        className="block text-sm font-medium mb-1"
        style={{ color: 'var(--foreground)' }}
        htmlFor="password"
      >
        Password
      </label>
      <input
        id="password"
        type="password"
        placeholder="••••••••"
        className="w-full px-4 py-2.5 rounded-xl border text-sm"
        style={{
          background: 'var(--surface-card)',
          borderColor: 'var(--border)',
          color: 'var(--foreground)',
        }}
        readOnly
      />
    </div>
    <button
      className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
      style={{ background: 'var(--accent-primary)' }}
    >
      Sign in
    </button>
    <p className="text-center text-xs" style={{ color: 'var(--foreground-muted)' }}>
      Don&apos;t have an account?{' '}
      <a href="#" style={{ color: 'var(--accent-primary)' }}>
        Sign up
      </a>
    </p>
  </div>
)

const MagicLinkForm = () => (
  <div className="space-y-4">
    <p className="text-sm text-center" style={{ color: 'var(--foreground-muted)' }}>
      Enter your email to receive a magic link.
    </p>
    <input
      type="email"
      placeholder="you@example.com"
      className="w-full px-4 py-2.5 rounded-xl border text-sm"
      style={{
        background: 'var(--surface-card)',
        borderColor: 'var(--border)',
        color: 'var(--foreground)',
      }}
      readOnly
    />
    <button
      className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
      style={{ background: 'var(--accent-primary)' }}
    >
      Send magic link
    </button>
  </div>
)

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/**
 * Login form — standard email + password layout centered on the page.
 * Shows the branded "BYOA" heading provided by the layout shell.
 */
export const LoginFormVariant: Story = {
  args: {
    children: <LoginForm />,
  },
}

/**
 * Magic-link form — minimal email-only variant for passwordless auth.
 */
export const MagicLinkVariant: Story = {
  args: {
    children: <MagicLinkForm />,
  },
}

/**
 * Empty children — renders the branded header with no form content.
 * Useful for verifying the centered container and typography in isolation.
 */
export const EmptyContent: Story = {
  args: {
    children: null,
  },
}
