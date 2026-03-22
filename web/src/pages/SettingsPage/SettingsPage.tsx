import { useState, useEffect } from 'react'

import { navigate, routes } from '@redwoodjs/router'
import { Metadata } from '@redwoodjs/web'
import { useAuth } from 'src/auth'
import { useLocalAI } from 'src/lib/local-ai'
import { Sun, Moon, Monitor, Brain, Download, LogOut } from 'lucide-react'

type Theme = 'light' | 'dark' | 'system'

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem('mymind-theme') as Theme) || 'system'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
    // Let prefers-color-scheme handle it
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', isDark)
  } else {
    root.setAttribute('data-theme', theme)
    root.classList.toggle('dark', theme === 'dark')
  }
}

const SettingsPage = () => {
  const { currentUser, logOut } = useAuth()
  const localAI = useLocalAI()
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('mymind-theme', theme)
  }, [theme])

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const themeOptions: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ]

  return (
    <>
      <Metadata title="Settings" />
      <div className="px-4 sm:px-6 py-6 max-w-lg mx-auto">
        <h2 className="font-serif text-xl mb-6" style={{ color: 'var(--foreground)' }}>
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
                    Gemma 3 running locally — ~700MB download
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
                  Downloading model... {Math.round(localAI.downloadProgress * 100)}%
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
            <button
              disabled
              className="w-full py-2.5 rounded-lg text-sm font-medium opacity-50 cursor-not-allowed"
              style={{
                backgroundColor: 'var(--surface-soft)',
                color: 'var(--foreground-muted)',
              }}
            >
              Export All Data (Coming Soon)
            </button>
          </div>
        </section>

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
