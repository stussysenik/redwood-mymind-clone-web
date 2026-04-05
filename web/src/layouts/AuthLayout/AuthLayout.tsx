import type { ReactNode } from 'react'
import { Link, routes } from '@redwoodjs/router'

interface AuthLayoutProps {
  children: ReactNode
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="w-full max-w-sm">
        {/* Back to home link */}
        <div style={{ marginBottom: '24px', textAlign: 'left' }}>
          <Link
            to={routes.landing()}
            style={{
              fontSize: '12px',
              fontFamily: 'var(--font-ui)',
              color: 'var(--foreground-muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              letterSpacing: '0.01em',
              transition: 'color var(--duration-fast) ease',
            }}
          >
            &#8592; Back to home
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1
            className="text-2xl font-mono font-bold mb-2"
            style={{ color: 'var(--foreground)' }}
          >
            byoa
          </h1>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '14px' }}>
            build your own algorithm
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}

export default AuthLayout
