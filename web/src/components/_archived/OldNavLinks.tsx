/**
 * ARCHIVED: Old navigation links that were in the AppLayout header.
 * Replaced by the minimal Logo | ViewToggle | Avatar layout on 2026-03-22.
 * Kept for reference in case we want to restore text-based navigation.
 *
 * Usage (was in AppLayout header):
 *   <nav className="hidden sm:flex items-center gap-6">
 *     <Link to={routes.home()} className="text-sm ...">Home</Link>
 *     <Link to={routes.spaces()} className="text-sm ...">Spaces</Link>
 *     <Link to={routes.serendipity()} className="text-sm ...">Serendipity</Link>
 *     <Link to={routes.graph()} className="text-sm ...">Graph</Link>
 *   </nav>
 */

import { Link, routes, useLocation } from '@redwoodjs/router'

export function OldNavLinks() {
  const { pathname } = useLocation()

  const links = [
    { to: routes.home(), label: 'Home', match: '/' },
    { to: routes.spaces(), label: 'Spaces', match: '/spaces' },
    { to: routes.serendipity(), label: 'Serendipity', match: '/serendipity' },
    { to: routes.graph(), label: 'Graph', match: '/graph' },
  ]

  return (
    <nav className="hidden sm:flex items-center gap-6">
      {links.map(({ to, label, match }) => (
        <Link
          key={label}
          to={to}
          className={`text-sm transition-colors ${
            pathname === match || pathname.startsWith(match + '/')
              ? 'text-[var(--foreground)] font-medium'
              : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
