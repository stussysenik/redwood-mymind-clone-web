import { useEffect, useState } from 'react'
import { navigate, routes, useLocation } from '@redwoodjs/router'
import { Metadata } from '@redwoodjs/web'
import { useAuth } from 'src/auth'

const LoginPage = () => {
  const { logIn, isAuthenticated } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { search } = useLocation()
  const redirectTo = new URLSearchParams(search).get('redirectTo') || routes.home()

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo)
    }
  }, [isAuthenticated, redirectTo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await logIn({ email, password })
      // Full reload ensures auth state is properly initialized
      window.location.href = redirectTo
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Metadata title="Log In" />
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--surface-danger)', color: 'var(--foreground)' }}>
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground-muted)' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              color: 'var(--foreground)',
              minHeight: 'var(--touch-target-min)',
            }}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground-muted)' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              color: 'var(--foreground)',
              minHeight: 'var(--touch-target-min)',
            }}
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'white',
            minHeight: 'var(--touch-target-min)',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity var(--duration-fast) ease',
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        <p className="text-center text-sm" style={{ color: 'var(--foreground-muted)' }}>
          Don't have an account?{' '}
          <a href="/signup" style={{ color: 'var(--accent-primary)' }}>Sign up</a>
        </p>
      </form>
    </>
  )
}

export default LoginPage
