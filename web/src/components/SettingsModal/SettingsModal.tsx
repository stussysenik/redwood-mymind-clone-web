import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'

import { X, Moon, Sun, Monitor, Check } from 'lucide-react'

import { useTheme, type Theme } from 'src/lib/theme/ThemeProvider'
import type { ThemeInfo } from 'src/lib/themes'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabId = 'theme' | 'colors' | 'typography'

const PRESET_BACKGROUNDS = [
  { name: 'Warm Cream', value: '#F7F6F3' },
  { name: 'Cool White', value: '#FAFAFA' },
  { name: 'Pure White', value: '#FFFFFF' },
  { name: 'Soft Gray', value: '#F3F4F6' },
  { name: 'Warm Sand', value: '#FAF7F2' },
  { name: 'Soft Pink', value: '#FDF2F8' },
  { name: 'Soft Blue', value: '#F0F9FF' },
  { name: 'Soft Green', value: '#F0FDF4' },
]

const PRESET_ACCENTS = [
  { name: 'Riso Orange', value: '#FF6B4A' },
  { name: 'Ocean Blue', value: '#3B82F6' },
  { name: 'Forest Green', value: '#22C55E' },
  { name: 'Royal Purple', value: '#8B5CF6' },
  { name: 'Hot Pink', value: '#EC4899' },
  { name: 'Amber Gold', value: '#F59E0B' },
]

// Inline theme card component — no separate file needed
const ThemeCard = ({
  t,
  isActive,
  onSelect,
}: {
  t: ThemeInfo
  isActive: boolean
  onSelect: (name: string) => void
}) => (
  <button
    onClick={() => onSelect(t.name)}
    className={`relative flex items-center gap-3 p-3 rounded-xl border transition-all ${
      isActive
        ? 'border-[var(--accent-primary)] bg-[var(--surface-accent)]'
        : 'border-[var(--border-default)] hover:border-[var(--border-emphasis)]'
    }`}
    style={{ minHeight: '48px' }}
  >
    {/* Color swatch */}
    <div
      className="w-8 h-8 rounded-lg flex-shrink-0 border border-black/10"
      style={{ backgroundColor: t.preview }}
    />
    {/* Label + badge */}
    <div className="flex-1 min-w-0 text-left">
      <div
        className="text-sm font-medium truncate"
        style={{ color: 'var(--foreground)' }}
      >
        {t.label}
      </div>
      <div
        className="text-[10px]"
        style={{ color: 'var(--foreground-muted)' }}
      >
        {t.category === 'daisyui' ? 'DaisyUI' : 'Custom'}
      </div>
    </div>
    {/* Active checkmark */}
    {isActive && (
      <Check
        className="w-4 h-4 flex-shrink-0"
        style={{ color: 'var(--accent-primary)' }}
      />
    )}
  </button>
)

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    theme,
    setTheme,
    themePack,
    setThemePack,
    availableThemes,
    skin,
    setSkin,
    availableSkins,
  } = useTheme()
  const [activeTab, setActiveTab] = useState<TabId>('theme')

  const handleThemeChange = useCallback(
    (newTheme: Theme) => {
      setTheme(newTheme)
    },
    [setTheme]
  )

  if (!isOpen) return null

  const themeOptions: { id: Theme; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ]

  const tabs: { id: TabId; label: string }[] = [
    { id: 'theme', label: 'Theme' },
    { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Typography' },
  ]

  const customThemes = availableThemes.filter((t) => t.category === 'custom')
  const daisyThemes = availableThemes.filter((t) => t.category === 'daisyui')

  // Colors section is de-emphasized when a non-default theme pack is active
  const colorsOpacity = themePack !== 'default' ? 0.45 : 1

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--surface-overlay)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl"
        style={{
          backgroundColor: 'var(--surface-card)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between p-4 border-b"
          style={{
            backgroundColor: 'var(--surface-card)',
            borderColor: 'var(--border-default)',
          }}
        >
          <h2
            className="font-serif text-lg font-bold"
            style={{ color: 'var(--foreground)' }}
          >
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{
              color: 'var(--foreground-muted)',
              minWidth: 'var(--touch-target-min)',
              minHeight: 'var(--touch-target-min)',
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 p-2 mx-4 mt-4 rounded-xl"
          style={{ backgroundColor: 'var(--surface-soft)' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor:
                  activeTab === tab.id
                    ? 'var(--surface-card)'
                    : 'transparent',
                color:
                  activeTab === tab.id
                    ? 'var(--foreground)'
                    : 'var(--foreground-muted)',
                boxShadow:
                  activeTab === tab.id ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {activeTab === 'theme' && (
            <div className="space-y-6">
              {/* ── Skin ── */}
              <div>
                <h3
                  className="text-sm font-medium mb-3"
                  style={{ color: 'var(--foreground-muted)' }}
                >
                  Skin
                </h3>
                <div className="flex flex-wrap gap-2">
                  {availableSkins.map((s) => {
                    const isActive = skin === s.name
                    return (
                      <button
                        key={s.name}
                        onClick={() => setSkin(s.name)}
                        title={s.description}
                        className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all"
                        style={{
                          backgroundColor: isActive
                            ? 'var(--surface-accent)'
                            : 'var(--surface-soft)',
                          border: `2px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
                          color: isActive
                            ? 'var(--accent-primary)'
                            : 'var(--foreground)',
                          minHeight: 'var(--touch-target-min)',
                        }}
                      >
                        <span className="text-xs font-medium">{s.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Theme Packs ── */}
              <div>
                <h3
                  className="text-sm font-medium mb-3"
                  style={{ color: 'var(--foreground-muted)' }}
                >
                  Theme Pack
                </h3>

                {/* Custom themes */}
                {customThemes.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                    {customThemes.map((t) => (
                      <ThemeCard
                        key={t.name}
                        t={t}
                        isActive={themePack === t.name}
                        onSelect={setThemePack}
                      />
                    ))}
                  </div>
                )}

                {/* Separator between custom and DaisyUI */}
                {customThemes.length > 0 && daisyThemes.length > 0 && (
                  <div
                    className="flex items-center gap-2 my-3"
                    style={{ color: 'var(--foreground-muted)' }}
                  >
                    <div
                      className="flex-1 h-px"
                      style={{ backgroundColor: 'var(--border-default)' }}
                    />
                    <span className="text-[10px] font-medium uppercase tracking-wider">
                      DaisyUI
                    </span>
                    <div
                      className="flex-1 h-px"
                      style={{ backgroundColor: 'var(--border-default)' }}
                    />
                  </div>
                )}

                {/* DaisyUI themes */}
                {daisyThemes.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {daisyThemes.map((t) => (
                      <ThemeCard
                        key={t.name}
                        t={t}
                        isActive={themePack === t.name}
                        onSelect={setThemePack}
                      />
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {availableThemes.length === 0 && (
                  <p
                    className="text-sm"
                    style={{ color: 'var(--foreground-muted)' }}
                  >
                    No theme packs available.
                  </p>
                )}
              </div>

              {/* ── Base Mode ── */}
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <h3
                    className="text-sm font-medium"
                    style={{ color: 'var(--foreground-muted)' }}
                  >
                    Base Mode
                  </h3>
                  {themePack !== 'default' && (
                    <span
                      className="text-[10px]"
                      style={{ color: 'var(--foreground-muted)' }}
                    >
                      Only applies with Default pack
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {themeOptions.map((option) => {
                    const Icon = option.icon
                    const isActive = theme === option.id
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleThemeChange(option.id)}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all"
                        style={{
                          backgroundColor: isActive
                            ? 'var(--surface-accent)'
                            : 'var(--surface-soft)',
                          border: `2px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
                          minHeight: 'var(--touch-target-comfortable)',
                        }}
                      >
                        <Icon
                          className="w-5 h-5"
                          style={{
                            color: isActive
                              ? 'var(--accent-primary)'
                              : 'var(--foreground-muted)',
                          }}
                        />
                        <span
                          className="text-xs font-medium"
                          style={{
                            color: isActive
                              ? 'var(--accent-primary)'
                              : 'var(--foreground)',
                          }}
                        >
                          {option.label}
                        </span>
                        {isActive && (
                          <Check
                            className="w-3.5 h-3.5"
                            style={{ color: 'var(--accent-primary)' }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Colors (de-emphasized when a theme pack is active) ── */}
              <div
                className="space-y-6 transition-opacity"
                style={{ opacity: colorsOpacity }}
              >
                {/* Accent Color */}
                <div>
                  <h3
                    className="text-sm font-medium mb-3"
                    style={{ color: 'var(--foreground-muted)' }}
                  >
                    Accent Color
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESET_ACCENTS.map((accent) => (
                      <button
                        key={accent.value}
                        className="flex items-center gap-2 p-3 rounded-xl transition-all"
                        style={{
                          backgroundColor: 'var(--surface-soft)',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded-full"
                          style={{ backgroundColor: accent.value }}
                        />
                        <span
                          className="text-xs"
                          style={{ color: 'var(--foreground)' }}
                        >
                          {accent.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Color */}
                <div>
                  <h3
                    className="text-sm font-medium mb-3"
                    style={{ color: 'var(--foreground-muted)' }}
                  >
                    Background
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {PRESET_BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.value}
                        className="flex flex-col items-center gap-1.5 p-2 rounded-xl"
                        style={{
                          border: '1px solid var(--border-default)',
                        }}
                        title={bg.name}
                      >
                        <div
                          className="w-full h-8 rounded-lg"
                          style={{
                            backgroundColor: bg.value,
                            border: '1px solid var(--border-default)',
                          }}
                        />
                        <span
                          className="text-[10px]"
                          style={{ color: 'var(--foreground-muted)' }}
                        >
                          {bg.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'colors' && (
            <div className="space-y-6">
              {/* Accent Color */}
              <div>
                <h3
                  className="text-sm font-medium mb-3"
                  style={{ color: 'var(--foreground-muted)' }}
                >
                  Accent Color
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_ACCENTS.map((accent) => (
                    <button
                      key={accent.value}
                      className="flex items-center gap-2 p-3 rounded-xl transition-all"
                      style={{
                        backgroundColor: 'var(--surface-soft)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded-full"
                        style={{ backgroundColor: accent.value }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: 'var(--foreground)' }}
                      >
                        {accent.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Color */}
              <div>
                <h3
                  className="text-sm font-medium mb-3"
                  style={{ color: 'var(--foreground-muted)' }}
                >
                  Background
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.value}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl"
                      style={{
                        border: '1px solid var(--border-default)',
                      }}
                      title={bg.name}
                    >
                      <div
                        className="w-full h-8 rounded-lg"
                        style={{
                          backgroundColor: bg.value,
                          border: '1px solid var(--border-default)',
                        }}
                      />
                      <span
                        className="text-[10px]"
                        style={{ color: 'var(--foreground-muted)' }}
                      >
                        {bg.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'typography' && (
            <div>
              <h3
                className="text-sm font-medium mb-3"
                style={{ color: 'var(--foreground-muted)' }}
              >
                Typography
              </h3>
              <p
                className="text-sm"
                style={{ color: 'var(--foreground-muted)' }}
              >
                Font customization coming soon.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}

export default SettingsModal
