import type { ReactNode } from 'react'

import * as Sentry from '@sentry/react'
import { FatalErrorBoundary, RedwoodProvider } from '@redwoodjs/web'
import { RedwoodApolloProvider } from '@redwoodjs/web/apollo'

import FatalErrorPage from 'src/pages/FatalErrorPage'
import { AuthProvider, useAuth } from 'src/auth'

import './index.css'

// Sentry — no-ops when DSN is absent
if (process.env.REDWOOD_ENV_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.REDWOOD_ENV_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    beforeSend(event) {
      if (!event.exception) return null
      return event
    },
  })
}

interface AppProps {
  children?: ReactNode
}

const App = ({ children }: AppProps) => (
  <Sentry.ErrorBoundary fallback={<FatalErrorPage />}>
    <FatalErrorBoundary page={FatalErrorPage}>
      <RedwoodProvider titleTemplate="%PageTitle | %AppTitle">
        <AuthProvider>
          <RedwoodApolloProvider useAuth={useAuth}>
            {children}
          </RedwoodApolloProvider>
        </AuthProvider>
      </RedwoodProvider>
    </FatalErrorBoundary>
  </Sentry.ErrorBoundary>
)

export default App
