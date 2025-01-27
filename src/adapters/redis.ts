import { createClient, SetOptions } from 'redis'
import { AppComponents, IRedisComponent, ICacheComponent } from '../types'

const TWO_HOURS_IN_SECONDS = 60 * 60 * 2

export async function createRedisComponent(
  components: Pick<AppComponents, 'logs' | 'config'>
): Promise<IRedisComponent & ICacheComponent> {
  const { logs, config } = components
  const logger = logs.getLogger('redis-component')
  const REDIS_HOST = (await config.getString('REDIS_HOST')) || '127.0.0.1'

  const url = `redis://${REDIS_HOST}:6379`

  const client = createClient({
    url
  })

  client.on('error', (err) => {
    logger.error(err)
  })

  async function start() {
    try {
      logger.debug('Connecting to Redis', { url })
      await client.connect()
      logger.debug('Successfully connected to Redis')
    } catch (err: any) {
      logger.error('Error connecting to Redis', err)
      throw err
    }
  }

  async function stop() {
    try {
      logger.debug('Disconnecting from Redis')
      await client.disconnect()
      logger.debug('Successfully disconnected from Redis')
    } catch (err: any) {
      logger.error('Error disconnecting from Redis', err)
    }
  }

  async function get<T>(key: string): Promise<T | null> {
    try {
      const serializedValue = await client.get(key)

      if (serializedValue) {
        return JSON.parse(serializedValue) as T
      }

      return null
    } catch (err: any) {
      logger.error(`Error getting key "${key}"`, err)
      throw err
    }
  }

  async function put<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value)
      await client.set(key, serializedValue, {
        EX: options?.EX || TWO_HOURS_IN_SECONDS
      })
      logger.debug(`Successfully set key "${key}"`)
    } catch (err: any) {
      logger.error(`Error setting key "${key}"`, err)
      throw err
    }
  }

  return {
    client,
    start,
    stop,
    get,
    put
  }
}
