/**
 * GraphDimensionToggle
 *
 * Two-state segmented control: 2D ↔ 3D.
 * Same visual language as the existing graph/list ViewModeToggle.
 * 44 px touch targets. Disabled for 200 ms after each change to prevent
 * double-mount flicker during the renderer cross-fade.
 */

import { useState, useCallback } from 'react'

import type { GraphDimension } from 'src/lib/graph-renderer-types'

interface GraphDimensionToggleProps {
  value: GraphDimension
  onChange: (next: GraphDimension) => void
  disabled?: boolean
}

export function GraphDimensionToggle({ value, onChange, disabled = false }: GraphDimensionToggleProps) {
  const [localDisabled, setLocalDisabled] = useState(false)

  const handleClick = useCallback((next: GraphDimension) => {
    if (disabled || localDisabled || next === value) return
    setLocalDisabled(true)
    onChange(next)
    setTimeout(() => setLocalDisabled(false), 200)
  }, [disabled, localDisabled, value, onChange])

  const isDisabled = disabled || localDisabled

  return (
    <div
      role="radiogroup"
      aria-label="Graph dimensionality"
      className="flex rounded-[10px] overflow-hidden"
      style={{
        backgroundColor: 'var(--surface-floating)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
        opacity: isDisabled ? 0.6 : 1,
        transition: 'opacity 100ms ease',
      }}
    >
      {(['2d', '3d'] as const).map((dim) => {
        const isActive = value === dim
        return (
          <button
            key={dim}
            role="radio"
            aria-checked={isActive}
            disabled={isDisabled}
            onClick={() => handleClick(dim)}
            style={{
              minWidth: 44,
              minHeight: 44,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--foreground)' : 'var(--foreground-muted)',
              backgroundColor: isActive ? 'var(--surface-soft)' : 'transparent',
              border: 'none',
              cursor: isDisabled ? 'default' : 'pointer',
              transition: 'background-color 150ms ease, color 150ms ease, font-weight 0ms',
              letterSpacing: '0.02em',
            }}
          >
            {dim === '2d' ? '2D' : '3D'}
          </button>
        )
      })}
    </div>
  )
}
