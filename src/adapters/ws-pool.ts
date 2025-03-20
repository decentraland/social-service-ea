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
      const data = await redis.get<{ lastActivity: number; startTime?: number }>(key)
      if (data && now - data.lastActivity > idleTimeoutInMs) {
        const id = key.replace('ws:conn:', '')

        if (data.startTime) {
          const duration = (now - data.startTime) / 1000
          metrics.observe('ws_connection_duration_seconds', {}, duration)
          logger.debug('Idle connection duration recorded', { id, durationSeconds: duration })
        }

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

    const startTime = Date.now()
    const multi = redis.client.multi()

    try {
      const result = await multi
        .zCard('ws:active_connections')
        .set(key, JSON.stringify({ lastActivity: startTime, startTime }), {
          NX: true,
          EX: Math.ceil(idleTimeoutInMs / 1000)
        })
        .zAdd('ws:active_connections', { score: startTime, value: id })
        .exec()

      if (!result) {
        throw new Error('Transaction failed')
      }

      const totalConnections = await getActiveConnections()

      logger.debug(`[DEBUGGING CONNECTION] Active connections ${totalConnections}`)
      metrics.observe('ws_active_connections', { type: 'total' }, totalConnections)
    } catch (error) {
      await Promise.all([redis.client.del(key), redis.client.zRem('ws:active_connections', id)])
      throw error
    }
  }

  async function releaseConnection(id: string) {
    try {
      logger.debug('[DEBUGGING CONNECTION] Releasing connection', {
        connectionId: id,
        timestamp: new Date().toISOString()
      })

      const key = `ws:conn:${id}`
      const connectionData = await redis.get<{ lastActivity: number; startTime?: number }>(key)
      await Promise.all([redis.client.del(key), redis.client.zRem('ws:active_connections', id)])
      const totalConnections = await redis.client.zCard('ws:active_connections')

      metrics.observe('ws_active_connections', { type: 'total' }, totalConnections)

      if (connectionData?.startTime) {
        const duration = (Date.now() - connectionData.startTime) / 1000
        metrics.observe('ws_connection_duration_seconds', {}, duration)
        logger.debug('Connection duration recorded', { id, durationSeconds: duration })
      }
    } catch (error: any) {
      logger.error('[DEBUGGING CONNECTION] Error releasing connection', {
        connectionId: id,
        error: error.message
      })
    }
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
