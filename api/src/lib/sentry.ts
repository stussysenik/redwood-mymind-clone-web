import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0,
    beforeSend(event) {
      if (!event.exception) return null
      return event
    },
  })
}

export { Sentry }
