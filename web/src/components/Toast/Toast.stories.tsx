import type { Meta, StoryObj } from '@storybook/react'

import { ToastProvider, useToast } from './Toast'

// ToastProvider is the exported component that combines context + rendering.
// We create a helper trigger component that fires toasts via the useToast hook.

function ToastTriggers() {
  const { showToast, showConfirm } = useToast()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      <button
        onClick={() => showToast('Card saved successfully!', 'success')}
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        Show Success Toast
      </button>
      <button
        onClick={() => showToast('Failed to save card.', 'error')}
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        Show Error Toast
      </button>
      <button
        onClick={() => showToast('Syncing in background…', 'info')}
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        Show Info Toast
      </button>
      <button
        onClick={() =>
          showConfirm(
            'Delete this card permanently?',
            () => console.log('confirmed delete'),
            'Delete'
          )
        }
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        Show Confirm Toast
      </button>
    </div>
  )
}

function ProviderWrapper() {
  return (
    <ToastProvider>
      <ToastTriggers />
    </ToastProvider>
  )
}

const meta: Meta<typeof ToastProvider> = {
  title: 'Components/Toast',
  component: ToastProvider,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ToastProvider>

/**
 * Interactive story — click the buttons to trigger each toast variant.
 * Toasts auto-dismiss after 3 seconds (except confirm toasts).
 */
export const Interactive: Story = {
  render: () => <ProviderWrapper />,
}
