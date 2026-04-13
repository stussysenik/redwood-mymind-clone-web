import { useState, useEffect, useRef } from 'react'

import { navigate, routes } from '@redwoodjs/router'
import { Metadata } from '@redwoodjs/web'
import { HexColorPicker } from 'react-colorful'
import { useAuth } from 'src/auth'
import { useLocalAI } from 'src/lib/local-ai'
import { LOCAL_AI_RUNTIME } from 'src/lib/local-ai/config'
import { Sun, Moon, Monitor, Brain, Download, LogOut, Type, Palette } from 'lucide-react'
import ExportBuilder from 'src/components/ExportBuilder/ExportBuilder'
import MobileCaptureSection from 'src/components/MobileCaptureSection/MobileCaptureSection'
import { useTheme } from 'src/lib/theme'

import { useTypography, PAIRINGS } from 'src/lib/typography'

const ACCENT_STORAGE_KEY = 'byoa-accent-color'
const SAVED_COLORS_KEY = 'byoa-saved-colors'
const DEFAULT_ACCENT = '#FF6B4A'

const ACCENT_PRESETS = [
  { hex: '#FF6B4A', label: 'Riso Orange' },
  { hex: '#3B82F6', label: 'Ocean Blue' },
  { hex: '#10B981', label: 'Emerald' },
  { hex: '#8B5CF6', label: 'Violet' },
  { hex: '#EC4899', label: 'Pink' },
  { hex: '#F59E0B', label: 'Amber' },
  { hex: '#0EA5E9', label: 'Sky' },
  { hex: '#000000', label: 'Black' },
]

function getStoredAccent(): string {
  if (typeof window === 'undefined') return DEFAULT_ACCENT
  return localStorage.getItem(ACCENT_STORAGE_KEY) || DEFAULT_ACCENT
}

function getSavedColors(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(SAVED_COLORS_KEY) || '[]')
  } catch {
    return []
  }
}

function applyAccentPreview(hex: string) {
  const root = document.documentElement
  root.style.setProperty('--accent-primary', hex)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const darken = (v: number) => Math.max(0, Math.round(v * 0.85))
  root.style.setProperty('--accent-hover', `rgb(${darken(r)}, ${darken(g)}, ${darken(b)})`)
  root.style.setProperty('--accent-light', `rgba(${r}, ${g}, ${b}, 0.1)`)
  root.style.setProperty('--surface-accent', `rgba(${r}, ${g}, ${b}, 0.08)`)
  root.style.setProperty('--surface-accent-strong', `rgba(${r}, ${g}, ${b}, 0.16)`)
}

// Apply on load
if (typeof window !== 'undefined') {
  const stored = getStoredAccent()
  if (stored !== DEFAULT_ACCENT) applyAccentPreview(stored)
}

const SettingsPage = () => {
  const { currentUser, logOut } = useAuth()
  const localAI = useLocalAI()
  const { theme, setTheme } = useTheme()
  const { pairing, setPairing } = useTypography()
  const [savedAccent, setSavedAccent] = useState(getStoredAccent) // committed color
  const [previewColor, setPreviewColor] = useState(getStoredAccent) // live picker color
  const [hexInput, setHexInput] = useState(getStoredAccent)
  const [showPicker, setShowPicker] = useState(false)
  const [savedColors, setSavedColors] = useState<string[]>(getSavedColors)
  const pickerRef = useRef<HTMLDivElement>(null)

  const isDirty = previewColor.toLowerCase() !== savedAccent.toLowerCase()

  // Live preview while dragging — no localStorage write
  const previewAccent = (hex: string) => {
    setPreviewColor(hex)
    setHexInput(hex)
    applyAccentPreview(hex)
  }

  // Commit: save to localStorage
  const commitAccent = (hex: string) => {
    setSavedAccent(hex)
    setPreviewColor(hex)
    setHexInput(hex)
    applyAccentPreview(hex)
    localStorage.setItem(ACCENT_STORAGE_KEY, hex)
  }

  const saveCustomColor = () => {
    const hex = previewColor.toUpperCase()
    if (savedColors.includes(hex)) return
    const updated = [hex, ...savedColors].slice(0, 12)
    setSavedColors(updated)
    localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(updated))
    commitAccent(hex)
  }

  const removeCustomColor = (hex: string) => {
    const updated = savedColors.filter((c) => c !== hex)
    setSavedColors(updated)
    localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(updated))
  }

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        // Revert if not committed
        if (isDirty) {
          previewAccent(savedAccent)
        }
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showPicker, isDirty, savedAccent])

  const themeOptions: { value: 'light' | 'dark' | 'system'; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ]

  return (
    <>
      <Metadata title="Settings" />
      <div className="px-4 sm:px-6 py-6 max-w-lg mx-auto">
        <h2 className="font-display text-xl mb-6" style={{ color: 'var(--foreground)' }}>
          Settings
        </h2>

        {/* Account */}
        <section className="mb-8">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--foreground-muted)' }}>
            Account
          </h3>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              {currentUser?.email || 'Not logged in'}
            </p>
          </div>
        </section>

        {/* Appearance — theme toggle */}
        <section className="mb-8">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--foreground-muted)' }}>
            Appearance
          </h3>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--foreground)' }}>Theme</p>
            <div className="flex gap-2">
              {themeOptions.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: theme === value ? 'var(--accent-primary)' : 'var(--surface-soft)',
                    color: theme === value ? '#FFFFFF' : 'var(--foreground-muted)',
                    border: theme === value ? 'none' : '1px solid var(--border-subtle)',
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Typography pairing */}
            <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="text-sm mb-3" style={{ color: 'var(--foreground)' }}>Typography</p>
              <div className="grid gap-2">
                {PAIRINGS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPairing(p.id)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-all"
                    style={{
                      backgroundColor: pairing === p.id ? 'var(--accent-light)' : 'var(--surface-soft)',
                      border: pairing === p.id
                        ? '1.5px solid var(--accent-primary)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <Type className="h-4 w-4 shrink-0" style={{ color: pairing === p.id ? 'var(--accent-primary)' : 'var(--foreground-muted)' }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{p.label}</p>
                      <p
                        className="text-xs truncate"
                        style={{
                          color: 'var(--foreground-muted)',
                          fontFamily: `'${p.display}', serif`,
                        }}
                      >
                        {p.specimen}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Accent Color */}
        <section className="mb-8">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--foreground-muted)' }}>
            Accent Color
          </h3>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}
            ref={pickerRef}
          >
            {/* Presets */}
            <div className="flex flex-wrap gap-2.5 mb-4">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  onClick={() => commitAccent(p.hex)}
                  className="h-8 w-8 rounded-full transition-transform active:scale-90"
                  style={{
                    backgroundColor: p.hex,
                    boxShadow: savedAccent.toUpperCase() === p.hex.toUpperCase()
                      ? `0 0 0 2px var(--background), 0 0 0 3.5px ${p.hex}`
                      : 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                  }}
                  title={p.label}
                  aria-label={p.label}
                />
              ))}
            </div>

            {/* Saved custom colors */}
            {savedColors.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--foreground-muted)' }}>
                  Saved
                </p>
                <div className="flex flex-wrap gap-2">
                  {savedColors.map((hex) => (
                    <button
                      key={hex}
                      onClick={() => commitAccent(hex)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        removeCustomColor(hex)
                      }}
                      className="h-7 w-7 rounded-full transition-transform active:scale-90"
                      style={{
                        backgroundColor: hex,
                        boxShadow: savedAccent.toUpperCase() === hex.toUpperCase()
                          ? `0 0 0 2px var(--background), 0 0 0 3.5px ${hex}`
                          : 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                      }}
                      title={`${hex} (long-press to remove)`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Hex input row */}
            <div className="flex items-center gap-2 mb-3">
              <button
                className="h-8 w-8 shrink-0 rounded-lg"
                style={{ backgroundColor: previewColor }}
                onClick={() => setShowPicker(!showPicker)}
                aria-label="Toggle color picker"
              />
              <div
                className="flex items-center flex-1 gap-1.5 rounded-lg px-3 py-2"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span className="text-xs font-mono" style={{ color: 'var(--foreground-muted)' }}>#</span>
                <input
                  type="text"
                  value={hexInput.replace('#', '')}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
                    setHexInput('#' + val)
                    if (val.length === 6) previewAccent('#' + val)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitAccent(previewColor)
                  }}
                  className="flex-1 bg-transparent text-sm font-mono outline-none"
                  style={{ color: 'var(--foreground)' }}
                  maxLength={6}
                  placeholder="FF6B4A"
                />
              </div>
            </div>

            {/* Color picker */}
            {showPicker && (
              <>
                <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid var(--border-subtle)' }}>
                  <HexColorPicker
                    color={previewColor}
                    onChange={previewAccent}
                    style={{ width: '100%', height: 220 }}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={saveCustomColor}
                    className="flex-1 rounded-lg py-2.5 text-sm font-medium transition-all active:scale-[0.98]"
                    style={{
                      backgroundColor: previewColor,
                      color: '#fff',
                      textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }}
                  >
                    Save Color
                  </button>
                  {isDirty && (
                    <button
                      onClick={() => previewAccent(savedAccent)}
                      className="rounded-lg px-4 py-2.5 text-sm font-medium"
                      style={{
                        backgroundColor: 'var(--surface-soft)',
                        color: 'var(--foreground-muted)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Reset to default */}
            {savedAccent !== DEFAULT_ACCENT && !showPicker && (
              <button
                onClick={() => commitAccent(DEFAULT_ACCENT)}
                className="mt-2 w-full rounded-lg py-2 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  color: 'var(--foreground-muted)',
                }}
              >
                Reset to default
              </button>
            )}
          </div>
        </section>

        {/* AI Settings */}
        <section className="mb-8">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--foreground-muted)' }}>
            AI
          </h3>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}
          >
            {/* Local AI toggle */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4" style={{ color: 'var(--foreground-muted)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    Browser AI Classification
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>
                    {LOCAL_AI_RUNTIME.modelLabel} running locally — {LOCAL_AI_RUNTIME.downloadLabel}
                  </p>
                </div>
              </div>
              <button
                onClick={() => localAI.setEnabled(!localAI.enabled)}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{
                  backgroundColor: localAI.enabled ? 'var(--accent-primary)' : 'var(--border-default)',
                }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ left: localAI.enabled ? 22 : 2 }}
                />
              </button>
            </div>

            {/* Status */}
            <div className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--foreground-muted)' }}>
              {localAI.status === 'ready' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Ready — classifies content instantly
                </>
              )}
              {localAI.status === 'loading' && (
                <>
                  <Download className="h-3 w-3 animate-pulse" />
                  Downloading model... {Math.round(localAI.downloadProgress)}%
                </>
              )}
              {localAI.status === 'error' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  Error loading model
                </>
              )}
              {localAI.status === 'idle' && !localAI.enabled && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--border-emphasis)' }} />
                  {localAI.isReady ? 'Disabled' : 'Not initialized'}
                </>
              )}
            </div>
          </div>
        </section>

        {/* Data */}
        <section className="mb-8">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--foreground-muted)' }}>
            Data
          </h3>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}
          >
            <ExportBuilder />
          </div>
        </section>

        <MobileCaptureSection />

        {/* Sign out */}
        <button
          onClick={async () => {
            await logOut()
            navigate(routes.login())
          }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: 'var(--surface-danger)',
            color: 'var(--foreground)',
            border: '1px solid var(--border-default)',
            minHeight: 'var(--touch-target-min)',
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </>
  )
}

export default SettingsPage
