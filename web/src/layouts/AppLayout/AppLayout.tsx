import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { LayoutGrid, Network, Settings, FolderOpen, LogOut } from 'lucide-react'

import { navigate, routes, useLocation } from '@redwoodjs/router'

import { useAuth } from 'src/auth'
import AddModal from 'src/components/AddModal'
import { LocalAIProvider } from 'src/lib/local-ai'

interface AppLayoutProps {
  children: ReactNode
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()
  const { currentUser, logOut } = useAuth()
  const isGraphView = pathname === '/graph'

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

  const avatarInitial = currentUser?.email
    ? currentUser.email.charAt(0).toUpperCase()
    : 'U'

  const handleSignOut = async () => {
    setShowAvatarDropdown(false)
    await logOut()
  }

  return (
    <LocalAIProvider>
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6"
        style={{
          height: 'var(--header-height)',
          backgroundColor: 'var(--header-backdrop)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <h1
            className="text-lg font-bold cursor-pointer"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--accent-primary)',
            }}
            onClick={() => navigate(routes.home())}
          >
            mymind
          </h1>
        </div>

        {/* Center: View toggle (desktop only) */}
        <div className="hidden sm:flex items-center">
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

      {/* Mobile bottom nav — 4 icons: Home, Spaces, Graph, Settings */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around py-2"
        style={{
          backgroundColor: 'var(--header-backdrop)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-default)',
          minHeight: 'var(--touch-target-comfortable)',
        }}
      >
        <a
          href="/"
          className="flex flex-col items-center gap-0.5 p-2"
          style={{
            color:
              pathname === '/'
                ? 'var(--accent-primary)'
                : 'var(--foreground-muted)',
            minWidth: 'var(--touch-target-min)',
          }}
        >
          <LayoutGrid size={20} />
          <span className="text-[10px]">Home</span>
        </a>
        <a
          href="/spaces"
          className="flex flex-col items-center gap-0.5 p-2"
          style={{
            color:
              pathname === '/spaces'
                ? 'var(--accent-primary)'
                : 'var(--foreground-muted)',
            minWidth: 'var(--touch-target-min)',
          }}
        >
          <FolderOpen size={20} />
          <span className="text-[10px]">Spaces</span>
        </a>
        <a
          href="/graph"
          className="flex flex-col items-center gap-0.5 p-2"
          style={{
            color:
              pathname === '/graph'
                ? 'var(--accent-primary)'
                : 'var(--foreground-muted)',
            minWidth: 'var(--touch-target-min)',
          }}
        >
          <Network size={20} />
          <span className="text-[10px]">Graph</span>
        </a>
        <a
          href="/settings"
          className="flex flex-col items-center gap-0.5 p-2"
          style={{
            color:
              pathname === '/settings'
                ? 'var(--accent-primary)'
                : 'var(--foreground-muted)',
            minWidth: 'var(--touch-target-min)',
          }}
        >
          <Settings size={20} />
          <span className="text-[10px]">Settings</span>
        </a>
      </nav>

      {/* Main content with bottom padding for mobile nav */}
      <main className="pb-16 sm:pb-0">{children}</main>

      {/* FAB (floating add button) */}
      <button
        className="fixed z-40 flex items-center justify-center rounded-full shadow-lg"
        style={{
          width: '56px',
          height: '56px',
          bottom: 'calc(var(--touch-target-comfortable) + 24px)',
          right: '16px',
          backgroundColor: 'var(--accent-primary)',
          color: 'white',
          boxShadow: 'var(--shadow-lg)',
          transition: 'transform var(--duration-fast) var(--ease-spring)',
        }}
        onClick={() => setShowAddModal(true)}
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
    </div>
    </LocalAIProvider>
  )
}

export default AppLayout
