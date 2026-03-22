import type { ReactNode } from 'react'

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
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--accent-primary)' }}
          >
            mymind
          </h1>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '14px' }}>
            Your visual knowledge manager
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}

export default AuthLayout
