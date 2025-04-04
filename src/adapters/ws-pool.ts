import { AppComponents, IWSPoolComponent } from '../types'

export async function createWSPoolComponent({
  metrics,
  config,
  redis,
  logs
}: Pick<AppComponents, 'metrics' | 'config' | 'redis' | 'logs'>): Promise<IWSPoolComponent> {
  const logger = logs.getLogger('ws-pool')
  const idleTimeoutInMs = (await config.getNumber('IDLE_TIMEOUT_IN_MS')) || 300000 // 5 minutes default

  const cleanupInterval = setInterval(async () => {
    const now = Date.now()
    const pattern = 'ws:conn:*'

    for await (const key of redis.client.scanIterator({ MATCH: pattern })) {
      const data = await redis.get<{ lastActivity: number; startTime: number }>(key)
      if (data && now - data.lastActivity > idleTimeoutInMs) {
        const id = key.replace('ws:conn:', '')
        await releaseConnection(id)
        metrics.increment('ws_idle_timeouts')
      }
    }
  }, 60000)

  async function acquireConnection(id: string) {
    const key = `ws:conn:${id}`
    const startTime = Date.now()

    try {
      const result = await redis.client
        .multi()
        .set(key, JSON.stringify({ lastActivity: startTime, startTime }), {
          NX: true,
          EX: Math.ceil(idleTimeoutInMs / 1000)
        })
        .sAdd('ws:conn_ids', id)
        .exec()

      if (!result) {
        throw new Error('Connection already exists')
      }

      const totalConnections = await getActiveConnections()
      metrics.observe('ws_active_connections', { type: 'total' }, totalConnections)
    } catch (error) {
      await Promise.all([redis.client.del(key), redis.client.sRem('ws:conn_ids', id)])
      throw error
    }
  }

  async function releaseConnection(id: string) {
    try {
      const key = `ws:conn:${id}`
      const endTime = Date.now()
      const connectionData = await redis.get<{ lastActivity: number; startTime: number }>(key)

      await redis.client.multi().del(key).sRem('ws:conn_ids', id).exec()

      const totalConnections = await getActiveConnections()
      metrics.observe('ws_active_connections', { type: 'total' }, totalConnections)

      if (connectionData?.startTime) {
        const duration = (endTime - connectionData.startTime) / 1000
        console.log('duration', duration)
        metrics.observe('ws_connection_duration_seconds', {}, duration)
      }
    } catch (error: any) {
      logger.error('Error releasing connection', {
        connectionId: id,
        error: error.message
      })
    }
  }

  async function updateActivity(id: string) {
    const key = `ws:conn:${id}`
    await redis.put(
      key,
      { lastActivity: Date.now() },
      {
        XX: true,
        EX: Math.ceil(idleTimeoutInMs / 1000)
      }
    )
  }

  async function isConnectionAvailable(id: string) {
    return (await redis.client.exists(`ws:conn:${id}`)) === 1
  }

  async function getActiveConnections(): Promise<number> {
    return await redis.client.sCard('ws:conn_ids')
  }

  async function cleanup() {
    clearInterval(cleanupInterval)
    const pattern = 'ws:conn:*'
    for await (const key of redis.client.scanIterator({ MATCH: pattern })) {
      const id = key.replace('ws:conn:', '')
      await releaseConnection(id)
    }
  }

  return {
    acquireConnection,
    releaseConnection,
    updateActivity,
    isConnectionAvailable,
    getActiveConnections,
    cleanup
  }
}
