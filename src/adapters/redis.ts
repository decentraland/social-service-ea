import { createClient } from 'redis'
import { AppComponents } from '../types'
import { IBaseComponent } from '@well-known-components/interfaces'

export interface IRedisComponent extends IBaseComponent {
  client: ReturnType<typeof createClient>
}

export default async function createRedisComponent(
  components: Pick<AppComponents, 'logs' | 'config'>
): Promise<IRedisComponent> {
  const { logs, config } = components
  const logger = logs.getLogger('redis-component')
  const REDIS_URL = (await config.getString('REDIS_CONNECTION_STRING')) || `redis://127.0.0.1:6379`

  const client = createClient({
    url: REDIS_URL
  })

  client.on('error', (err) => {
    logger.error(err)
  })

  async function start() {
    await client.connect()
  }

  async function stop() {
    await client.disconnect()
  }

  return {
    client,
    start,
    stop
  }
}
