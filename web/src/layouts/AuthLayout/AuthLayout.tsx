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
