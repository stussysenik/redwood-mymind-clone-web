import type { ReactNode } from 'react'

interface AppLayoutProps {
  children: ReactNode
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
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
        <div className="flex items-center gap-3">
          <h1
            className="text-lg font-bold"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--accent-primary)' }}
          >
            mymind
          </h1>
        </div>

        <nav className="hidden sm:flex items-center gap-4">
          <a href="/" className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Home</a>
          <a href="/spaces" className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Spaces</a>
          <a href="/serendipity" className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Serendipity</a>
          <a href="/graph" className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Graph</a>
        </nav>

        <div className="flex items-center gap-2">
          {/* User menu placeholder */}
          <button
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
            style={{ backgroundColor: 'var(--surface-accent)', color: 'var(--accent-primary)' }}
          >
            U
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around py-2"
        style={{
          backgroundColor: 'var(--header-backdrop)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-default)',
          minHeight: 'var(--touch-target-comfortable)',
        }}
      >
        <a href="/" className="flex flex-col items-center gap-0.5 p-2" style={{ color: 'var(--foreground-muted)', minWidth: 'var(--touch-target-min)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span className="text-[10px]">Home</span>
        </a>
        <a href="/spaces" className="flex flex-col items-center gap-0.5 p-2" style={{ color: 'var(--foreground-muted)', minWidth: 'var(--touch-target-min)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <span className="text-[10px]">Spaces</span>
        </a>
        <a href="/serendipity" className="flex flex-col items-center gap-0.5 p-2" style={{ color: 'var(--foreground-muted)', minWidth: 'var(--touch-target-min)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <span className="text-[10px]">Discover</span>
        </a>
        <a href="/graph" className="flex flex-col items-center gap-0.5 p-2" style={{ color: 'var(--foreground-muted)', minWidth: 'var(--touch-target-min)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="9" x2="12" y2="5"/></svg>
          <span className="text-[10px]">Graph</span>
        </a>
      </nav>

      {/* Main content with bottom padding for mobile nav */}
      <main className="pb-16 sm:pb-0">
        {children}
      </main>

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
        title="Add new card"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  )
}

export default AppLayout
