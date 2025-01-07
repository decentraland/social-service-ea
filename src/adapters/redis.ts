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
  const REDIS_HOST = (await config.getString('REDIS_HOST')) || '127.0.0.1'

  const url = `redis://${REDIS_HOST}:6379`

  const client = createClient({
    url
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
