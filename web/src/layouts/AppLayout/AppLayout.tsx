import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { LayoutGrid, Network, Settings, FolderOpen, LogOut, Archive, Dices } from 'lucide-react'

import { navigate, routes, useLocation } from '@redwoodjs/router'

import { useAuth } from 'src/auth'
import { haptic } from 'src/lib/haptics'
import { useShakeDetection } from 'src/hooks/useShakeDetection'
import AddModal from 'src/components/AddModal'
import { ShuffleModal } from 'src/components/ShuffleModal/ShuffleModal'
import { ToastProvider } from 'src/components/Toast/Toast'
import { LocalAIProvider } from 'src/lib/local-ai'
import { initTypography } from 'src/lib/typography'

initTypography()

// Apply persisted accent color on load
if (typeof window !== 'undefined') {
  const storedAccent = localStorage.getItem('byoa-accent-color')
  if (storedAccent) {
    const root = document.documentElement
    root.style.setProperty('--accent-primary', storedAccent)
    const r = parseInt(storedAccent.slice(1, 3), 16)
    const g = parseInt(storedAccent.slice(3, 5), 16)
    const b = parseInt(storedAccent.slice(5, 7), 16)
    const darken = (v: number) => Math.max(0, Math.round(v * 0.85))
    root.style.setProperty('--accent-hover', `rgb(${darken(r)}, ${darken(g)}, ${darken(b)})`)
    root.style.setProperty('--accent-light', `rgba(${r}, ${g}, ${b}, 0.1)`)
    root.style.setProperty('--surface-accent', `rgba(${r}, ${g}, ${b}, 0.08)`)
    root.style.setProperty('--surface-accent-strong', `rgba(${r}, ${g}, ${b}, 0.16)`)
  }
}

interface AppLayoutProps {
  children: ReactNode
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [showShuffle, setShowShuffle] = useState(false)
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()
  const { currentUser, logOut } = useAuth()
  const isGraphView = pathname === '/graph'

  useShakeDetection(() => {
    haptic('heavy')
    setShowShuffle((prev) => !prev)
  })

  // Close dropdown on outside click
  useEffect(() => {
    if (!showAvatarDropdown) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        avatarRef.current &&
        !avatarRef.current.contains(e.target as Node)
      ) {
        setShowAvatarDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAvatarDropdown])

  // Cmd+A to open Add modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !showAddModal) {
        // Only intercept if not in an input/textarea
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
        e.preventDefault()
        haptic('soft')
        setShowAddModal(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showAddModal])

  const avatarInitial = currentUser?.email
    ? currentUser.email.charAt(0).toUpperCase()
    : 'U'

  const handleSignOut = async () => {
    setShowAvatarDropdown(false)
    await logOut()
  }

  return (
    <ToastProvider>
    <LocalAIProvider>
    <div
      className="app-shell min-h-screen"
      style={{
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      {/* Header */}
      <header
        className="app-header sticky top-0 z-50 flex items-center justify-between"
        style={{
          backgroundColor: 'var(--background)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <h1
            className="cursor-pointer"
            style={{
              color: 'var(--foreground)',
              fontFamily: "'Rubik Mono One', monospace",
              fontSize: '13px',
              textTransform: 'lowercase',
              fontVariantCaps: 'all-small-caps',
              letterSpacing: '0.04em',
            }}
            onClick={() => navigate(routes.home())}
          >
            byoa
          </h1>
        </div>

        {/* Center: View toggle (desktop only) */}
        <div className="hidden sm:flex items-center gap-2">
          {/* Dice / Shuffle — first */}
          <button
            onClick={() => { haptic('soft'); setShowShuffle(true) }}
            className="flex items-center justify-center rounded-full transition-all hover:-translate-y-0.5"
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: 'var(--surface-soft)',
              color: 'var(--foreground-muted)',
              border: '1px solid var(--border-default)',
            }}
            title="Shuffle — random discovery"
            aria-label="Shuffle cards"
          >
            <Dices size={15} />
          </button>

          <div
            className="flex items-center rounded-full"
            style={{
              border: '1px solid var(--border-default)',
              backgroundColor: 'var(--surface-hover)',
              padding: '2px',
            }}
          >
            <button
              onClick={() => !isGraphView || navigate(routes.home())}
              className="flex items-center justify-center rounded-full transition-colors"
              style={{
                width: '28px',
                height: '28px',
                backgroundColor: !isGraphView
                  ? 'var(--accent-primary)'
                  : 'transparent',
                color: !isGraphView ? 'white' : 'var(--foreground-muted)',
              }}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => isGraphView || navigate(routes.graph())}
              className="flex items-center justify-center rounded-full transition-colors"
              style={{
                width: '28px',
                height: '28px',
                backgroundColor: isGraphView
                  ? 'var(--accent-primary)'
                  : 'transparent',
                color: isGraphView ? 'white' : 'var(--foreground-muted)',
              }}
              title="Graph view"
              aria-label="Graph view"
            >
              <Network size={14} />
            </button>
          </div>
        </div>

        {/* Right: Avatar with dropdown */}
        <div className="relative flex items-center gap-2">
          <button
            ref={avatarRef}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
            style={{
              backgroundColor: 'var(--surface-accent)',
              color: 'var(--accent-primary)',
            }}
            onClick={() => setShowAvatarDropdown((prev) => !prev)}
            aria-label="User menu"
          >
            {avatarInitial}
          </button>

          {/* Avatar dropdown */}
          {showAvatarDropdown && (
            <div
              ref={dropdownRef}
              className="absolute right-0 w-48 rounded-lg overflow-hidden shadow-lg"
              style={{
                top: 'calc(100% + 8px)',
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 100,
              }}
            >
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                style={{ color: 'var(--foreground)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    'var(--surface-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
                onClick={() => {
                  setShowAvatarDropdown(false)
                  navigate(routes.spaces())
                }}
              >
                <FolderOpen size={16} style={{ color: 'var(--foreground-muted)' }} />
                Spaces
              </button>
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                style={{ color: 'var(--foreground)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    'var(--surface-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
                onClick={() => {
                  setShowAvatarDropdown(false)
                  navigate(routes.archive())
                }}
              >
                <Archive size={16} style={{ color: 'var(--foreground-muted)' }} />
                Archive
              </button>
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                style={{ color: 'var(--foreground)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    'var(--surface-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
                onClick={() => {
                  setShowAvatarDropdown(false)
                  navigate(routes.settings())
                }}
              >
                <Settings size={16} style={{ color: 'var(--foreground-muted)' }} />
                Settings
              </button>
              <div
                style={{
                  height: '1px',
                  backgroundColor: 'var(--border-default)',
                  margin: '4px 0',
                }}
              />
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                style={{ color: 'var(--foreground-muted)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    'var(--surface-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
                onClick={handleSignOut}
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="app-bottom-nav sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around"
        style={{
          backgroundColor: 'var(--background)',
          borderTop: '1px solid var(--border-default)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {[
          { href: '/', icon: <LayoutGrid size={20} />, label: 'Feed', match: pathname === '/' },
          { action: () => { haptic('soft'); setShowShuffle(true) }, icon: <Dices size={20} />, label: 'Shuffle', match: false },
          { href: '/graph', icon: <Network size={20} />, label: 'Graph', match: pathname === '/graph' },
          { href: '/spaces', icon: <FolderOpen size={20} />, label: 'Spaces', match: pathname.startsWith('/spaces') },
          { href: '/settings', icon: <Settings size={20} />, label: 'Settings', match: pathname === '/settings' },
        ].map((item, i) => {
          const Tag = item.href ? 'a' : 'button'
          const props = item.href
            ? { href: item.href, onClick: () => haptic('light') }
            : { onClick: item.action, type: 'button' as const }

          return (
            <Tag
              key={item.label}
              {...(props as any)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
              style={{
                color: item.match
                  ? 'var(--accent-primary)'
                  : 'var(--foreground-muted)',
              }}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </Tag>
          )
        })}
      </nav>

      {/* Main content with bottom padding for mobile nav */}
      <main className="app-main">{children}</main>

      {/* FAB (floating add button) */}
      <button
        className="app-fab fixed z-40 flex items-center justify-center rounded-full shadow-lg"
        style={{
          width: '56px',
          height: '56px',
          right: '16px',
          backgroundColor: 'var(--accent-primary)',
          color: 'white',
          boxShadow: 'var(--shadow-lg)',
          transition: 'transform var(--duration-fast) var(--ease-spring)',
        }}
        onClick={() => { haptic('medium'); setShowAddModal(true) }}
        title="Add new card"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {showAddModal && (
        <AddModal isOpen={true} onClose={() => setShowAddModal(false)} />
      )}

      {showShuffle && (
        <ShuffleModal onClose={() => setShowShuffle(false)} />
      )}
    </div>
    </LocalAIProvider>
    </ToastProvider>
  )
}

export default AppLayout
