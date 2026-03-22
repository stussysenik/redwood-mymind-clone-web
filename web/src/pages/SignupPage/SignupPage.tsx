import { useState } from 'react'
import { navigate, routes } from '@redwoodjs/router'
import { Metadata } from '@redwoodjs/web'
import { useAuth } from 'src/auth'

const SignupPage = () => {
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signUp({ email, password })
      navigate(routes.home())
    } catch (err: any) {
      setError(err.message || 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Metadata title="Sign Up" />
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--surface-danger)', color: 'var(--foreground)' }}>
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground-muted)' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', color: 'var(--foreground)', minHeight: 'var(--touch-target-min)' }}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground-muted)' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', color: 'var(--foreground)', minHeight: 'var(--touch-target-min)' }}
            placeholder="At least 6 characters"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'var(--accent-primary)', color: 'white', minHeight: 'var(--touch-target-min)', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
        <p className="text-center text-sm" style={{ color: 'var(--foreground-muted)' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: 'var(--accent-primary)' }}>Log in</a>
        </p>
      </form>
    </>
  )
}

export default SignupPage
