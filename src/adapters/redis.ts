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
      await client.connect()
    } catch (err: any) {
      logger.error('Error connecting to Redis', err)
      throw err
    }
  }

  async function stop() {
    try {
      await client.quit()
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
    } catch (err: any) {
      logger.error(`Error setting key "${key}"`, err)
      throw err
    }
  }

  async function addToSet(key: string, member: string): Promise<number> {
    try {
      return await client.sAdd(key, member)
    } catch (err: any) {
      logger.error(`Error adding member "${member}" to set "${key}"`, err)
      throw err
    }
  }

  async function removeFromSet(key: string, member: string): Promise<number> {
    try {
      return await client.sRem(key, member)
    } catch (err: any) {
      logger.error(`Error removing member "${member}" from set "${key}"`, err)
      throw err
    }
  }

  async function listSetMembers(key: string): Promise<string[]> {
    try {
      return await client.sMembers(key)
    } catch (err: any) {
      logger.error(`Error getting members from set "${key}"`, err)
      throw err
    }
  }

  return {
    client,
    start,
    stop,
    get,
    put,
    addToSet,
    removeFromSet,
    listSetMembers
  }
}
