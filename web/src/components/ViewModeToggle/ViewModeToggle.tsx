import type { ReactNode } from 'react'

interface ViewModeOption {
  value: string
  label: string
  icon: ReactNode
}

interface ViewModeToggleProps {
  ariaLabel: string
  value: string
  options: ViewModeOption[]
  onChange: (value: string) => void
}

export function ViewModeToggle({
  ariaLabel,
  value,
  options,
  onChange,
}: ViewModeToggleProps) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full p-1"
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
            onClick={() => onChange(option.value)}
            className="inline-flex min-h-[36px] items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
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
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ViewModeToggle
