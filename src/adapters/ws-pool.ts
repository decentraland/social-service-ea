import { AppComponents, IWSPoolComponent } from '../types'

export async function createWSPoolComponent({
  metrics,
  config,
  redis,
  logs
}: Pick<AppComponents, 'metrics' | 'config' | 'redis' | 'logs'>): Promise<IWSPoolComponent> {
  const logger = logs.getLogger('ws-pool')
  const idleTimeoutInMs = (await config.getNumber('IDLE_TIMEOUT_IN_MS')) || 300000 // 5 minutes default

  // Track the last reported connection count to avoid unnecessary metric updates
  let lastReportedConnections = 0

  const cleanupInterval = setInterval(async () => {
    try {
      const now = Date.now()
      const pattern = 'ws:conn:*'
      let connectionsCleaned = 0

      for await (const key of redis.client.scanIterator({ MATCH: pattern })) {
        const data = await redis.get<{ lastActivity: number; startTime: number }>(key)
        if (data && now - data.lastActivity > idleTimeoutInMs) {
          const id = key.replace('ws:conn:', '')
          await releaseConnection(id)
          connectionsCleaned++
          metrics.increment('ws_idle_timeouts')
        }
      }

      // Only update metrics if connections were actually cleaned up
      if (connectionsCleaned > 0) {
        await updateConnectionMetrics()
      }
    } catch (error: any) {
      logger.error('Error cleaning up idle connections', {
        error: error.message
      })
    }
  }, 60000)

  async function updateConnectionMetrics() {
    const totalConnections = await getActiveConnections()
    // Always update metrics if this is the first time (lastReportedConnections === 0) or if count changed
    if (lastReportedConnections === 0 || totalConnections !== lastReportedConnections) {
      metrics.observe('ws_active_connections', { type: 'total' }, totalConnections)
      lastReportedConnections = totalConnections
    }
  }

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

      await updateConnectionMetrics()
    } catch (error: any) {
      logger.error('Error acquiring connection', {
        connectionId: id,
        error: error.message
      })
      await redis.client.multi().del(key).sRem('ws:conn_ids', id).exec()
      throw error
    }
  }

  async function releaseConnection(id: string) {
    try {
      const key = `ws:conn:${id}`
      const endTime = Date.now()
      const connectionData = await redis.get<{ lastActivity: number; startTime: number }>(key)

      await redis.client.multi().del(key).sRem('ws:conn_ids', id).exec()

      // Update metrics immediately after releasing connection
      await updateConnectionMetrics()

      if (connectionData?.startTime) {
        const duration = (endTime - connectionData.startTime) / 1000
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
    try {
      const key = `ws:conn:${id}`
      await redis.put(
        key,
        { lastActivity: Date.now() },
        {
          XX: true,
          EX: Math.ceil(idleTimeoutInMs / 1000)
        }
      )
    } catch (error: any) {
      logger.error('Error updating activity', {
        connectionId: id,
        error: error.message
      })
      throw error
    }
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
    // Update metrics after cleanup to reflect the final state
    await updateConnectionMetrics()
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
