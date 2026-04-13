/**
 * ClusterSheet - Bottom sheet (mobile) / slide-over (desktop) for saving a cluster
 */

import { useState, useCallback, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { haptic } from 'src/lib/haptics';

interface ClusterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, note: string) => void;
  nodeCount: number;
  isSaving?: boolean;
  error?: string | null;
}

export function ClusterSheet({
  isOpen,
  onClose,
  onSave,
  nodeCount,
  isSaving = false,
  error = null,
}: ClusterSheetProps) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setName('');
      setNote('');
    }
  }, [isOpen]);

  // Keyboard shortcuts: Cmd/Ctrl+Enter to save, Esc to cancel
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, name, note]);

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName || isSaving) return;

    haptic('medium');
    onSave(trimmedName, note.trim());
  }, [name, note, onSave, isSaving]);

  const isValid = name.trim().length > 0 && name.trim().length <= 60;
  const noteLength = note.length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet container - bottom on mobile, right on desktop */}
      <div
        className="fixed z-50 bg-[var(--surface-floating)] shadow-2xl
          /* Mobile: bottom sheet */
          bottom-0 left-0 right-0 rounded-t-2xl
          /* Desktop: right slide-over */
          md:bottom-auto md:left-auto md:top-0 md:right-0 md:h-full md:w-[400px] md:rounded-l-2xl md:rounded-t-none
          animate-in slide-in-from-bottom md:slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cluster-sheet-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <div>
            <h2
              id="cluster-sheet-title"
              className="text-base font-semibold text-[var(--foreground)]"
            >
              Save Cluster
            </h2>
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
              {nodeCount} card{nodeCount !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--surface-hover)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-[var(--foreground-muted)]" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Name field */}
          <div>
            <label
              htmlFor="cluster-name"
              className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
            >
              Name <span className="text-[var(--accent-primary)]">*</span>
            </label>
            <input
              id="cluster-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Architecture References"
              maxLength={60}
              className="w-full px-3 py-2.5 rounded-xl
                bg-[var(--surface-subtle)]
                border border-[var(--border-subtle)]
                text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]
                focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30 focus:border-[var(--accent-primary)]
                transition-all"
              autoFocus
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-[var(--foreground-muted)]">
                Required
              </span>
              <span
                className={`text-xs ${
                  name.length > 60
                    ? 'text-red-500'
                    : 'text-[var(--foreground-muted)]'
                }`}
              >
                {name.length}/60
              </span>
            </div>
          </div>

          {/* Note field */}
          <div>
            <label
              htmlFor="cluster-note"
              className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
            >
              Note
            </label>
            <textarea
              id="cluster-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a short description..."
              maxLength={280}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl resize-none
                bg-[var(--surface-subtle)]
                border border-[var(--border-subtle)]
                text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]
                focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30 focus:border-[var(--accent-primary)]
                transition-all"
            />
            <div className="flex justify-end mt-1.5">
              <span
                className={`text-xs ${
                  noteLength > 280
                    ? 'text-red-500'
                    : 'text-[var(--foreground-muted)]'
                }`}
              >
                {noteLength}/280
              </span>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl
                bg-[var(--surface-subtle)]
                text-[var(--foreground)]
                font-medium
                hover:bg-[var(--surface-hover)]
                transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid || isSaving}
              className="flex-1 px-4 py-2.5 rounded-xl
                bg-[var(--accent-primary)]
                text-white
                font-medium
                hover:bg-[var(--accent-primary-hover)]
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all
                flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Cluster
                </>
              )}
            </button>
          </div>

          {/* Keyboard hint */}
          <p className="text-xs text-center text-[var(--foreground-muted)] pt-2">
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] font-mono text-[10px]">
              Cmd
            </kbd>
            +
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] font-mono text-[10px]">
              Enter
            </kbd>{' '}
            to save ·{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] font-mono text-[10px]">
              Esc
            </kbd>{' '}
            to cancel
          </p>
        </div>
      </div>
    </>
  );
}
