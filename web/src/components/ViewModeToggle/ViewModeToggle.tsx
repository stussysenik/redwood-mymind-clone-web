import type { Dispatch, ReactNode, SetStateAction } from 'react'

import { haptic } from 'src/lib/haptics'

interface ViewModeOption {
  value: string
  label: string
  icon: ReactNode
}

interface ViewModeToggleProps<T extends string = string> {
  ariaLabel: string
  value: T
  options: ViewModeOption[]
  onChange: Dispatch<SetStateAction<T>>
}

export function ViewModeToggle<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: ViewModeToggleProps<T>) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full p-0.5 sm:gap-1 sm:p-1"
      role="tablist"
      aria-label={ariaLabel}
      style={{
        backgroundColor: 'var(--surface-elevated)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {options.map((option) => {
        const isActive = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => { haptic('selection'); onChange(option.value as T) }}
            className="inline-flex min-h-[32px] items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all sm:min-h-[36px] sm:gap-2 sm:px-3 sm:py-1.5"
            style={{
              backgroundColor: isActive
                ? 'var(--accent-primary)'
                : 'transparent',
              color: isActive ? '#FFFFFF' : 'var(--foreground-muted)',
            }}
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center">
              {option.icon}
            </span>
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ViewModeToggle
