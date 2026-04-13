import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ClusterSheet } from './ClusterSheet';

const meta: Meta<typeof ClusterSheet> = {
  title: 'Components/ClusterSheet',
  component: ClusterSheet,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ClusterSheet>;

// Wrapper to manage state
function ClusterSheetWrapper(props: Omit<React.ComponentProps<typeof ClusterSheet>, 'isOpen' | 'onClose'>) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="relative w-full h-screen bg-[var(--surface-subtle)]">
      <button
        onClick={() => setIsOpen(true)}
        className="m-4 px-4 py-2 bg-[var(--accent-primary)] text-white rounded-lg"
      >
        Open Cluster Sheet
      </button>
      <ClusterSheet
        {...props}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <ClusterSheetWrapper
      nodeCount={5}
      onSave={(name, note) => console.log('Save:', { name, note })}
    />
  ),
};

export const SingleNode: Story = {
  render: () => (
    <ClusterSheetWrapper
      nodeCount={1}
      onSave={(name, note) => console.log('Save:', { name, note })}
    />
  ),
};

export const ManyNodes: Story = {
  render: () => (
    <ClusterSheetWrapper
      nodeCount={42}
      onSave={(name, note) => console.log('Save:', { name, note })}
    />
  ),
};

export const Saving: Story = {
  render: () => (
    <ClusterSheetWrapper
      nodeCount={5}
      onSave={(name, note) => console.log('Save:', { name, note })}
      isSaving={true}
    />
  ),
};

export const WithError: Story = {
  render: () => (
    <ClusterSheetWrapper
      nodeCount={5}
      onSave={(name, note) => console.log('Save:', { name, note })}
      error="Failed to save cluster. Please try again."
    />
  ),
};
