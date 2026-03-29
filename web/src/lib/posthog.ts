import posthog from 'posthog-js'

const key = process.env.REDWOOD_ENV_POSTHOG_KEY

if (key) {
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    advanced_disable_decide: true,
    persistence: 'localStorage',
  })
}

export { posthog }
