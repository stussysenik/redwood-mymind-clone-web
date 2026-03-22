import type { Meta, StoryObj } from '@storybook/react'

import { LocalAIStatus } from './LocalAIStatus'

// useLocalAI is stubbed at src/lib/local-ai.ts.
// The stub always returns { status: 'idle', enabled: false } so LocalAIStatus
// returns null in its default state. We use render overrides to simulate
// the other status states by patching the module mock inline.

// To demonstrate all variants visually we create thin wrapper components
// that override the hook return value via a decorator approach.

// Note: since the stub is a module-level function we can demonstrate each
// status state by creating small inline wrappers that use the real component
// but with a manual prop-driven visual duplicate.

import { Brain } from 'lucide-react'

type StatusVariant = 'loading' | 'ready' | 'error' | 'classifying'

function StatusDemo({ status }: { status: StatusVariant }) {
  const dotColor =
    status === 'ready'
      ? 'bg-green-500'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-amber-500'

  const label =
    status === 'ready'
      ? 'Local AI ready'
      : status === 'error'
        ? 'Local AI error'
        : status === 'loading'
          ? 'Loading model...'
          : 'Classifying...'

  const animate = status === 'loading' || status === 'classifying' ? 'animate-pulse' : ''

  return (
    <div
      className="relative flex items-center"
      title={label}
      data-testid="local-ai-status"
    >
      <Brain className="h-4 w-4 text-[var(--foreground-muted)]" />
      <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${dotColor} ${animate}`} />
    </div>
  )
}

const meta: Meta = {
  title: 'Components/LocalAIStatus',
  parameters: {
    layout: 'centered',
  },
}

export default meta

/** Default — stub returns idle/disabled, component renders nothing. */
export const IdleHidden: StoryObj = {
  render: () => <LocalAIStatus />,
}

/** Ready state — green dot. */
export const Ready: StoryObj = {
  render: () => <StatusDemo status="ready" />,
}

/** Loading state — amber pulsing dot. */
export const Loading: StoryObj = {
  render: () => <StatusDemo status="loading" />,
}

/** Error state — red dot. */
export const Error: StoryObj = {
  render: () => <StatusDemo status="error" />,
}

/** Classifying state — amber pulsing dot. */
export const Classifying: StoryObj = {
  render: () => <StatusDemo status="classifying" />,
}
