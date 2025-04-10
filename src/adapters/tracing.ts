import * as Sentry from '@sentry/node'
import { AppComponents, ITracingComponent } from '../types'
import { isErrorWithMessage } from '../utils/errors'

export async function createTracingComponent({
  config,
  logs
}: Pick<AppComponents, 'config' | 'logs'>): Promise<ITracingComponent> {
  const logger = logs.getLogger('tracing-component')

  const release = `${(await config.getString('SENTRY_RELEASE_PREFIX')) || 'social-service-ea'}@${(await config.getString('CURRENT_VERSION')) || 'development'}`
  const environment = (await config.getString('ENV')) || 'development'

  Sentry.withScope((scope) => {
    scope.setTags({
      environment,
      release
    })
  })

  return {
    captureException(error: Error, context?: Record<string, any>) {
      try {
        Sentry.withScope((scope) => {
          if (context?.address) {
            scope.setUser({ id: context.address })
            scope.setTag('address', context.address)
          }

          if (context?.category) {
            scope.setTag('category', context.category)
          }

          if (context?.wsConnectionId) {
            scope.setTag('ws_connection_id', context.wsConnectionId)
          }

          if (context) {
            const { address, category, wsConnectionId, ...additionalContext } = context
            scope.setContext('additional', additionalContext)
          }

          Sentry.captureException(error)
        })
      } catch (error: any) {
        const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
        logger.error('Failed to capture exception in tracing system', {
          error: errorMessage,
          originalError: error
        })
      }
    }
  }
}
