import { navigate, routes } from '@redwoodjs/router'
import { Metadata } from '@redwoodjs/web'
import { useAuth } from 'src/auth'

const SettingsPage = () => {
  const { currentUser, logOut } = useAuth()

  return (
    <>
      <Metadata title="Settings" />
      <div className="px-4 sm:px-6 py-6 max-w-lg mx-auto">
        <h2 className="font-serif text-xl mb-6" style={{ color: 'var(--foreground)' }}>Settings</h2>

        {/* Account section */}
        <section className="mb-8">
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--foreground-muted)' }}>Account</h3>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}
          >
            <p className="text-sm" style={{ color: 'var(--foreground)' }}>
              {currentUser?.email || 'Not logged in'}
            </p>
          </div>
        </section>

        {/* Appearance section */}
        <section className="mb-8">
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--foreground-muted)' }}>Appearance</h3>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}
          >
            <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Theme settings coming soon</p>
          </div>
        </section>

        {/* Sign out */}
        <button
          onClick={async () => {
            await logOut()
            navigate(routes.login())
          }}
          className="w-full py-3 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: 'var(--surface-danger)',
            color: 'var(--foreground)',
            border: '1px solid var(--border-default)',
            minHeight: 'var(--touch-target-min)',
          }}
        >
          Sign Out
        </button>
      </div>
    </>
  )
}

export default SettingsPage
