import * as Sentry from '@sentry/node'
import { config } from 'dotenv'

// Load .env file
config()

/**
 * Patterns for standalone transactions that should be filtered out.
 * These are typically Redis/DB operations from background processes
 * that lack parent context and would otherwise appear as standalone transactions.
 * IMPORTANT: Spans within a transaction are not filtered out.
 * @see https://docs.sentry.io/platforms/node/configuration/sampling/#ignoring-standalone-transactions
 */
const FILTERED_TRANSACTION_PATTERNS = [
  /^GET\s/,
  /^SET\s/,
  /^MGET/,
  /^DEL\s/,
  /^SADD\s/,
  /^SREM\s/,
  /^PUBLISH\s/,
  /^HGET\s/,
  /^HSET\s/,
  /^HMGET/,
  /^LPUSH\s/,
  /^RPUSH\s/,
  /^EXPIRE\s/
]

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('SENTRY_DSN not found, skipping Sentry initialization')
    return
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENV || 'development',
    release: `${process.env.SENTRY_RELEASE_PREFIX || 'social-service-ea'}@${process.env.CURRENT_VERSION || 'development'}`,
    integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()],
    debug: process.env.SENTRY_DEBUG === 'true',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.001,
    beforeSendTransaction(event) {
      const name = event.transaction || ''
      for (const pattern of FILTERED_TRANSACTION_PATTERNS) {
        if (pattern.test(name)) {
          return null
        }
      }

      return event
    }
  })
}
