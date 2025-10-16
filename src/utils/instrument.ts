import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'
import { config } from 'dotenv'

// Load .env file
config()

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('SENTRY_DSN not found, skipping Sentry initialization')
    return
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENV || 'development',
    release: `${process.env.SENTRY_RELEASE_PREFIX || 'social-service-ea'}@${process.env.CURRENT_VERSION || 'development'}`,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      nodeProfilingIntegration()
    ],
    debug: process.env.SENTRY_DEBUG === 'true',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.001,
    profileSessionSampleRate: Number(process.env.SENTRY_PROFILE_SESSION_SAMPLE_RATE) || 0.001,
    sendDefaultPii: false
  })
}
