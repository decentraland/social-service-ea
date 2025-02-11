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
      const data = await redis.get<{ lastActivity: number }>(key)
      if (data && now - data.lastActivity > idleTimeoutInMs) {
        const id = key.replace('ws:conn:', '')
        await releaseConnection(id)
        metrics.increment('ws_idle_timeouts')
      }
    }
  }, 60000)

  async function acquireConnection(id: string) {
    logger.debug('[DEBUGGING CONNECTION] Attempting to acquire connection', {
      connectionId: id,
      timestamp: new Date().toISOString()
    })

    const key = `ws:conn:${id}`

    if (await redis.client.exists(key)) {
      throw new Error('Connection already exists')
    }

    const multi = redis.client.multi()

    try {
      const result = await multi
        .zCard('ws:active_connections')
        .set(key, JSON.stringify({ lastActivity: Date.now() }), {
          NX: true,
          EX: Math.ceil(idleTimeoutInMs / 1000)
        })
        .zAdd('ws:active_connections', { score: Date.now(), value: id })
        .exec()

      if (!result) {
        throw new Error('Transaction failed')
      }

      const connections = await redis.client.zRange('ws:active_connections', 0, -1)

      logger.debug('[DEBUGGING CONNECTION] Active connections', {
        connections: connections.map((c) => c.replace('ws:conn:', '')).join(', ')
      })

      const totalConnections = connections.length
      metrics.observe('ws_active_connections', { type: 'total' }, totalConnections)
    } catch (error) {
      await Promise.all([redis.client.del(key), redis.client.zRem('ws:active_connections', id)])
      throw error
    }
  }

  async function releaseConnection(id: string) {
    logger.debug('[DEBUGGING CONNECTION] Releasing connection', {
      connectionId: id,
      timestamp: new Date().toISOString()
    })

    const key = `ws:conn:${id}`
    await Promise.all([redis.client.del(key), redis.client.zRem('ws:active_connections', id)])
    const totalConnections = await redis.client.zCard('ws:active_connections')
    metrics.observe('ws_active_connections', { type: 'total' }, totalConnections)
  }

  async function updateActivity(id: string) {
    logger.debug('[DEBUGGING CONNECTION] Updating connection activity', {
      connectionId: id,
      timestamp: new Date().toISOString()
    })

    const key = `ws:conn:${id}`
    await redis.put(
      key,
      { lastActivity: Date.now() },
      {
        XX: true, // Only update if exists
        EX: Math.ceil(idleTimeoutInMs / 1000) // Reset TTL
      }
    )
  }

  async function isConnectionAvailable(id: string) {
    return (await redis.client.exists(`ws:conn:${id}`)) === 1
  }

  async function getActiveConnections() {
    return await redis.client.zCard('ws:active_connections')
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
