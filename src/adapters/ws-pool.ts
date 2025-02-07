import { AppComponents, IWSPoolComponent } from '../types'

export async function createWSPoolComponent({
  metrics,
  config,
  redis
}: Pick<AppComponents, 'metrics' | 'config' | 'redis'>): Promise<IWSPoolComponent> {
  const idleTimeoutInMs = (await config.getNumber('IDLE_TIMEOUT_IN_MS')) || 300000 // 5 minutes default

  const cleanupInterval = setInterval(async () => {
    const now = Date.now()
    const pattern = 'ws:conn:*'

    for await (const key of redis.client.scanIterator({ MATCH: pattern })) {
      const data = await redis.get<{ lastActivity: number }>(key)
      if (data && now - data.lastActivity > idleTimeoutInMs) {
        const id = key.replace('ws:conn:', '')
        await releaseConnection(id)
        metrics.increment('ws_idle_timeouts', { id })
      }
    }
  }, 60000)

  async function acquireConnection(id: string) {
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

      const totalConnections: number = await redis.client.zCard('ws:active_connections')
      metrics.observe('ws_active_connections', { type: 'total' }, totalConnections)
    } catch (error) {
      await Promise.all([redis.client.del(key), redis.client.zRem('ws:active_connections', id)])
      throw error
    }
  }

  async function releaseConnection(id: string) {
    const key = `ws:conn:${id}`
    await Promise.all([redis.client.del(key), redis.client.zRem('ws:active_connections', id)])
    const totalConnections = await redis.client.zCard('ws:active_connections')
    metrics.observe('ws_active_connections', { type: 'total' }, totalConnections)
  }

  async function updateActivity(id: string) {
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
