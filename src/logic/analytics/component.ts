import { isErrorWithMessage } from '../../utils/errors'
import { Environment, IAnalyticsComponent, IAnalyticsDependencies } from './types'

export async function createAnalyticsComponent<T extends Record<string, any>>(
  components: Pick<IAnalyticsDependencies, 'fetcher' | 'logs'>,
  context: string,
  env: Environment,
  analyticsApiUrl: string,
  analyticsApiToken: string
): Promise<IAnalyticsComponent<T>> {
  const { fetcher, logs } = components
  const logger = logs.getLogger('analytics-component')

  async function sendEvent(name: keyof T, body: T[keyof T]): Promise<void> {
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

  return {
    sendEvent
  }
}
