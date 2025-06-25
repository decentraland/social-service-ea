import { isErrorWithMessage } from '../../utils/errors'
import { IAnalyticsComponent, IAnalyticsDependencies } from './types'

export async function createAnalyticsComponent<T extends Record<string, any>>(
  components: Pick<IAnalyticsDependencies, 'fetcher' | 'logs' | 'config'>
): Promise<IAnalyticsComponent<T>> {
  const { fetcher, logs, config } = components
  const logger = logs.getLogger('analytics-component')
  const context = config.requireString('ANALYTICS_CONTEXT')
  const analyticsApiUrl = await config.requireString('ANALYTICS_API_URL')
  const analyticsApiToken = await config.requireString('ANALYTICS_API_TOKEN')
  const env = config.requireString('ENV')

  async function _sendEvent(name: keyof T, body: T[keyof T]): Promise<void> {
    logger.info(`Sending event to Analytics ${name.toString()}`)

    try {
      const response = await fetcher.fetch(analyticsApiUrl, {
        method: 'POST',
        headers: {
          'x-token': analyticsApiToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: name,
          body: {
            ...body,
            env
          },
          context
        })
      })

      if (!response.ok) {
        throw new Error(`Got status ${response.status} from the Analytics API`)
      }
    } catch (error) {
      logger.error(`Error sending event to Analytics ${name.toString()}`, {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
    }
  }

  function fireEvent(name: keyof T, body: T[keyof T]): void {
    void _sendEvent(name, body)
  }

  async function sendEvent(name: keyof T, body: T[keyof T]): Promise<void> {
    return _sendEvent(name, body)
  }

  return {
    sendEvent,
    fireEvent
  }
}
