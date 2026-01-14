import * as Sentry from '@sentry/node'
import { config } from 'dotenv'

// Load .env file
config()

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('SENTRY_DSN not found, skipping Sentry initialization')
    return
  }

  // Patterns for standalone Redis transactions from background operations that provide low observability value
  // These are high-volume, thin operations (peer heartbeats, status checks, caching, pubsub) that consume quota without insight
  // They originate from: NATS event handlers, setImmediate callbacks, or Redis pub/sub - all lacking trace context
  const FILTERED_TRANSACTION_PATTERNS = [
    // Peer tracking (NATS handlers)
    /^GET peer-status:/,
    /^SET peer-status:/,
    // World stats (NATS handlers)
    /^SREM world-connected-peers/,
    /^SADD world-connected-peers/,
    /^SREM connected-peers/,
    /^SADD connected-peers/,
    // Profile caching (setImmediate breaks trace context)
    /^GET catalyst:minimal:profile:/,
    /^SET catalyst:minimal:profile:/,
    /^MGET/, // Batch profile cache reads
    // Redis pub/sub (NATS handlers → pubsub)
    /^PUBLISH /
  ]

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENV || 'development',
    release: `${process.env.SENTRY_RELEASE_PREFIX || 'social-service-ea'}@${process.env.CURRENT_VERSION || 'development'}`,
    integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()],
    debug: process.env.SENTRY_DEBUG === 'true',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.001,
    beforeSendTransaction(event) {
      const transactionName = event.transaction || ''
      // Filter out standalone Redis transactions from NATS handlers
      if (FILTERED_TRANSACTION_PATTERNS.some((pattern) => pattern.test(transactionName))) {
        return null
      }
      return event
    }
  })
}
