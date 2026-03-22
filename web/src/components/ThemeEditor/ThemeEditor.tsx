/**
 * ThemeEditor -- Full-page creative tool for building custom themes.
 *
 * Desktop: side-by-side layout (320px controls left, flex-1 preview right).
 * Mobile:  preview fullscreen with a collapsible bottom controls sheet.
 *
 * Every token change is applied instantly via CSS custom property overrides
 * on document.documentElement.  Overrides are cleaned up when the editor
 * unmounts so the rest of the app is not affected.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { HexColorPicker } from 'react-colorful'

import { useTheme } from 'src/lib/theme'

import { EditorPreview } from './EditorPreview'

// =============================================================================
// HELPERS
// =============================================================================

/** Darken a hex color by a given percentage (0-100). */
function darken(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - percent / 100)))
  const g = Math.max(
    0,
    Math.round(((num >> 8) & 0xff) * (1 - percent / 100))
  )
  const b = Math.max(0, Math.round((num & 0xff) * (1 - percent / 100)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Return an rgba() string from a hex color + alpha. */
function withAlpha(hex: string, alpha: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** True when the value looks like a plain 6-digit hex color. */
function isHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim())
}

// =============================================================================
// CURATED FONT LIST
// =============================================================================

const SANS_FONTS = [
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'Roboto', value: "'Roboto', system-ui, sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', system-ui, sans-serif" },
  { label: 'Poppins', value: "'Poppins', system-ui, sans-serif" },
  { label: 'DM Sans', value: "'DM Sans', system-ui, sans-serif" },
  {
    label: 'Plus Jakarta Sans',
    value: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
]

const SERIF_FONTS = [
  {
    label: 'Libre Baskerville',
    value: "'Libre Baskerville', Georgia, serif",
  },
  { label: 'Merriweather', value: "'Merriweather', Georgia, serif" },
  {
    label: 'Playfair Display',
    value: "'Playfair Display', Georgia, serif",
  },
  { label: 'Lora', value: "'Lora', Georgia, serif" },
]

const MONO_FONTS = [
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'Fira Code', value: "'Fira Code', monospace" },
  { label: 'Space Mono', value: "'Space Mono', monospace" },
]

const ALL_FONTS = [
  { group: 'Sans-Serif', fonts: SANS_FONTS },
  { group: 'Serif', fonts: SERIF_FONTS },
  { group: 'Monospace', fonts: MONO_FONTS },
]

/** Inject a Google Fonts stylesheet for the given family if not already present. */
function ensureGoogleFont(familyName: string) {
  const clean = familyName.replace(/'/g, '')
  const href = `https://fonts.googleapis.com/css2?family=${clean.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Collapsible section header. */
function EditorSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3
        className="text-xs font-bold uppercase tracking-wider mb-3"
        style={{ color: 'var(--foreground-muted)' }}
      >
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ColorRow -- label + swatch + hex input + popover picker
// ---------------------------------------------------------------------------

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const canPick = isHex(value)

  return (
    <div className="flex items-center gap-2 relative" ref={ref}>
      <span
        className="text-xs w-20 shrink-0"
        style={{ color: 'var(--foreground-muted)' }}
      >
        {label}
      </span>

      {/* Swatch */}
      <button
        type="button"
        className="w-7 h-7 rounded-lg shrink-0 border"
        style={{
          backgroundColor: value,
          borderColor: 'var(--border)',
          cursor: canPick ? 'pointer' : 'default',
        }}
        onClick={() => canPick && setOpen(!open)}
        aria-label={`Pick color for ${label}`}
      />

      {/* Text input */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 px-2 py-1.5 rounded-md text-xs font-mono"
        style={{
          backgroundColor: 'var(--surface-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
        }}
      />

      {/* Picker popover */}
      {open && canPick && (
        <div
          className="absolute left-0 top-full mt-2 z-[100] p-3 rounded-xl shadow-lg"
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border)',
          }}
        >
          <HexColorPicker color={value} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ColorSwatch -- small clickable circle for the tag color grid
// ---------------------------------------------------------------------------

function ColorSwatch({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const canPick = isHex(value)

  return (
    <div className="relative flex justify-center" ref={ref}>
      <button
        type="button"
        className="w-10 h-10 rounded-xl border transition-transform hover:scale-110"
        style={{ backgroundColor: value, borderColor: 'var(--border)' }}
        onClick={() => canPick && setOpen(!open)}
        aria-label="Pick tag color"
      />
      {open && canPick && (
        <div
          className="absolute bottom-full mb-2 z-[100] p-3 rounded-xl shadow-lg"
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border)',
          }}
        >
          <HexColorPicker color={value} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FontSelect -- dropdown with curated Google Fonts
// ---------------------------------------------------------------------------

function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newVal = e.target.value
      onChange(newVal)
      // Extract the family name and load it from Google Fonts
      const match = newVal.match(/'([^']+)'/)
      if (match) ensureGoogleFont(match[1])
    },
    [onChange]
  )

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-xs w-20 shrink-0"
        style={{ color: 'var(--foreground-muted)' }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={handleChange}
        className="flex-1 min-w-0 px-2 py-1.5 rounded-md text-xs appearance-none"
        style={{
          backgroundColor: 'var(--surface-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
        }}
      >
        {ALL_FONTS.map(({ group, fonts }) => (
          <optgroup key={group} label={group}>
            {fonts.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SliderRow -- label + range input + numeric display
// ---------------------------------------------------------------------------

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-xs w-20 shrink-0"
        style={{ color: 'var(--foreground-muted)' }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="flex-1 accent-[var(--accent-primary)]"
      />
      <span
        className="text-xs font-mono w-8 text-right"
        style={{ color: 'var(--foreground)' }}
      >
        {value}px
      </span>
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ThemeEditor() {
  // -----------------------------------------------------------------------
  // Token state
  // -----------------------------------------------------------------------
  const [tokens, setTokens] = useState<Record<string, string>>({
    background: '#F7F6F3',
    'background-secondary': '#EFEEEB',
    foreground: '#2D2D2D',
    'foreground-muted': '#6B6B6B',
    'card-bg': '#FFFFFF',
    'accent-primary': '#FF6B4A',
    'accent-hover': '#E35332',
    'accent-light': 'rgba(255, 107, 74, 0.1)',
    border: 'rgba(0, 0, 0, 0.06)',
    'border-hover': 'rgba(0, 0, 0, 0.12)',
    'font-sans': "'Inter', system-ui, sans-serif",
    'font-serif': "'Libre Baskerville', Georgia, serif",
    'radius-sm': '6',
    'radius-md': '10',
    'radius-lg': '14',
    'radius-xl': '18',
    'shadow-intensity': '1',
    // Tag colors
    'tag-green': '#00A99D',
    'tag-red': '#FF48B0',
    'tag-blue': '#2B579A',
    'tag-orange': '#FF6B4A',
    'tag-purple': '#9D7AD2',
    'tag-pink': '#FD7BB9',
    'tag-cyan': '#00A99D',
    'tag-amber': '#FFE800',
  })

  const [themeName, setThemeName] = useState('my-theme')
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light')
  const [mobileOpen, setMobileOpen] = useState(false)

  const { skin, setSkin, availableSkins } = useTheme()

  // -----------------------------------------------------------------------
  // Live CSS injection
  // -----------------------------------------------------------------------
  useEffect(() => {
    const root = document.documentElement
    Object.entries(tokens).forEach(([key, value]) => {
      if (key.startsWith('radius-')) {
        root.style.setProperty(`--${key}`, `${value}px`)
      } else {
        root.style.setProperty(`--${key}`, value)
      }
    })
    return () => {
      // Remove inline overrides so the app reverts to its theme CSS
      Object.keys(tokens).forEach((key) => {
        root.style.removeProperty(`--${key}`)
      })
    }
  }, [tokens])

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  const updateToken = useCallback((key: string, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }))
  }, [])

  const exportJSON = useCallback(() => {
    const manifest = {
      name: themeName,
      label: themeName
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      colorMode,
      category: 'community',
      preview: tokens['accent-primary'],
      tokens: Object.fromEntries(
        Object.entries(tokens)
          .filter(([k]) => !k.includes('intensity'))
          .map(([k, v]) => [k, k.startsWith('radius-') ? `${v}px` : v])
      ),
    }
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${themeName}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [themeName, colorMode, tokens])

  const copyJSON = useCallback(() => {
    const manifest = {
      name: themeName,
      label: themeName.replace(/-/g, ' '),
      colorMode,
      category: 'community',
      preview: tokens['accent-primary'],
      tokens: { ...tokens },
    }
    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2))
  }, [themeName, colorMode, tokens])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div
      className="fixed inset-0 flex"
      style={{ backgroundColor: 'var(--background)' }}
    >
      {/* ================================================================
          CONTROLS PANEL
          Desktop: left sidebar 320px
          Mobile:  bottom sheet sliding up from the bottom
          ================================================================ */}
      <div
        className={`
          ${mobileOpen ? 'translate-y-0' : 'translate-y-[calc(100%-48px)]'}
          md:translate-y-0 md:relative md:w-[320px]
          fixed bottom-0 left-0 right-0 z-50
          md:h-full h-[70vh]
          transition-transform duration-300
          border-t md:border-t-0 md:border-r
          overflow-y-auto
        `}
        style={{
          backgroundColor: 'var(--surface-card)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Mobile drag handle */}
        <div
          className="md:hidden flex justify-center py-2 cursor-pointer sticky top-0 z-10"
          style={{ backgroundColor: 'var(--surface-card)' }}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <div
            className="w-8 h-1 rounded-full"
            style={{ backgroundColor: 'var(--foreground-muted)' }}
          />
        </div>

        <div className="p-4 space-y-6">
          {/* HEADER */}
          <div>
            <h1
              className="text-lg font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              Theme Editor
            </h1>
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Create your own theme with live preview
            </p>
          </div>

          {/* IDENTITY */}
          <EditorSection title="Identity">
            <input
              value={themeName}
              onChange={(e) =>
                setThemeName(e.target.value.replace(/[^a-z0-9-]/g, ''))
              }
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
              placeholder="theme-name"
            />
            <div className="flex gap-2 mt-2">
              {(['light', 'dark'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setColorMode(mode)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor:
                      colorMode === mode
                        ? 'var(--accent-light)'
                        : 'var(--surface-soft)',
                    color:
                      colorMode === mode
                        ? 'var(--accent-primary)'
                        : 'var(--foreground-muted)',
                    border:
                      colorMode === mode
                        ? '1px solid var(--accent-primary)'
                        : '1px solid transparent',
                  }}
                >
                  {mode === 'light' ? '\u2600\uFE0F' : '\uD83C\uDF19'} {mode}
                </button>
              ))}
            </div>
          </EditorSection>

          {/* PALETTE */}
          <EditorSection title="Palette">
            <ColorRow
              label="Background"
              value={tokens.background}
              onChange={(v) => updateToken('background', v)}
            />
            <ColorRow
              label="Secondary"
              value={tokens['background-secondary']}
              onChange={(v) => updateToken('background-secondary', v)}
            />
            <ColorRow
              label="Text"
              value={tokens.foreground}
              onChange={(v) => updateToken('foreground', v)}
            />
            <ColorRow
              label="Muted Text"
              value={tokens['foreground-muted']}
              onChange={(v) => updateToken('foreground-muted', v)}
            />
            <ColorRow
              label="Card"
              value={tokens['card-bg']}
              onChange={(v) => updateToken('card-bg', v)}
            />
          </EditorSection>

          {/* ACCENT */}
          <EditorSection title="Accent">
            <ColorRow
              label="Primary"
              value={tokens['accent-primary']}
              onChange={(v) => {
                updateToken('accent-primary', v)
                // Auto-derive hover and light variants
                if (isHex(v)) {
                  updateToken('accent-hover', darken(v, 15))
                  updateToken('accent-light', withAlpha(v, 0.1))
                }
              }}
            />
            <ColorRow
              label="Hover"
              value={tokens['accent-hover']}
              onChange={(v) => updateToken('accent-hover', v)}
            />
          </EditorSection>

          {/* TYPOGRAPHY */}
          <EditorSection title="Typography">
            <FontSelect
              label="Sans"
              value={tokens['font-sans']}
              onChange={(v) => updateToken('font-sans', v)}
            />
            <FontSelect
              label="Serif"
              value={tokens['font-serif']}
              onChange={(v) => updateToken('font-serif', v)}
            />
          </EditorSection>

          {/* SHAPE */}
          <EditorSection title="Shape">
            <SliderRow
              label="Radius"
              value={parseInt(tokens['radius-md']) || 10}
              min={0}
              max={28}
              onChange={(v) => {
                const ratio = v / 10
                updateToken('radius-sm', String(Math.round(6 * ratio)))
                updateToken('radius-md', String(v))
                updateToken('radius-lg', String(Math.round(14 * ratio)))
                updateToken('radius-xl', String(Math.round(18 * ratio)))
              }}
            />
          </EditorSection>

          {/* BORDERS */}
          <EditorSection title="Borders">
            <ColorRow
              label="Border"
              value={tokens.border}
              onChange={(v) => updateToken('border', v)}
            />
            <ColorRow
              label="Hover"
              value={tokens['border-hover']}
              onChange={(v) => updateToken('border-hover', v)}
            />
          </EditorSection>

          {/* SKIN */}
          <EditorSection title="Skin">
            <div className="flex flex-wrap gap-2">
              {availableSkins.map((s) => (
                <button
                  key={s.name}
                  onClick={() => setSkin(s.name)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    backgroundColor:
                      skin === s.name
                        ? 'var(--accent-light)'
                        : 'var(--surface-soft)',
                    color:
                      skin === s.name
                        ? 'var(--accent-primary)'
                        : 'var(--foreground-muted)',
                    border:
                      skin === s.name
                        ? '1px solid var(--accent-primary)'
                        : '1px solid transparent',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </EditorSection>

          {/* TAG COLORS */}
          <EditorSection title="Tag Colors">
            <div className="grid grid-cols-4 gap-2">
              {[
                'tag-green',
                'tag-red',
                'tag-blue',
                'tag-orange',
                'tag-purple',
                'tag-pink',
                'tag-cyan',
                'tag-amber',
              ].map((key) => (
                <ColorSwatch
                  key={key}
                  value={tokens[key]}
                  onChange={(v) => updateToken(key, v)}
                />
              ))}
            </div>
          </EditorSection>

          {/* ACTIONS */}
          <div className="flex gap-2 pt-2 pb-4">
            <button
              onClick={exportJSON}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'white',
              }}
            >
              Export JSON
            </button>
            <button
              onClick={copyJSON}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================
          PREVIEW PANEL
          ================================================================ */}
      <div
        className="flex-1 overflow-y-auto p-6"
        style={{ backgroundColor: 'var(--background)' }}
      >
        <EditorPreview />
      </div>
    </div>
  )
}
