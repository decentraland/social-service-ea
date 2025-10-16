import * as Sentry from '@sentry/node'
import { AppComponents, IProfilingComponent } from '../types'

export async function createProfilingComponent({ logs }: Pick<AppComponents, 'logs'>): Promise<IProfilingComponent> {
  const logger = logs.getLogger('profiling-component')

  const component: IProfilingComponent = {
    startProfiler(name: string, context?: Record<string, any>) {
      try {
        Sentry.profiler.startProfiler()

        if (context) {
          Sentry.withScope((scope) => {
            Object.entries(context).forEach(([key, value]) => {
              scope.setTag(`profiler_${key}`, String(value))
            })
            scope.setTag('profiler_name', name)
          })
        }

        logger.debug('Started profiler', { name, ...(context || {}) })
      } catch (error) {
        logger.error('Failed to start profiler', { name, error: String(error) })
      }
    },

    stopProfiler(name: string) {
      try {
        Sentry.profiler.stopProfiler()
        logger.debug('Stopped profiler', { name })
      } catch (error) {
        logger.error('Failed to stop profiler', { name, error: String(error) })
      }
    },

    async withProfiling<T>(name: string, fn: () => Promise<T>, context?: Record<string, any>): Promise<T> {
      component.startProfiler(name, context)
      try {
        return await fn()
      } finally {
        component.stopProfiler(name)
      }
    }
  }

  return component
}
