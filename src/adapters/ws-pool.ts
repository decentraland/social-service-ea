import { AppComponents, IWSPoolComponent } from '../types'

export async function createWSPoolComponent({
  metrics,
  config,
  redis,
  logs
}: Pick<AppComponents, 'metrics' | 'config' | 'redis' | 'logs'>): Promise<IWSPoolComponent> {
  const logger = logs.getLogger('ws-pool')
  const idleTimeoutInMs = (await config.getNumber('IDLE_TIMEOUT_IN_MS')) || 300000 // 5 minutes default

  /**
   * Observe the current connection count from Redis
   * and update the metric accordingly.
   */
  async function observeConnectionCount() {
    try {
      const currentCount = await getActiveConnections()
      metrics.observe('ws_active_connections', { type: 'total' }, currentCount)

      logger.debug('Observed active connections', {
        count: currentCount
      })
    } catch (error: any) {
      logger.error('Error observing connection count', {
        error: error.message
      })
    }
  }

  /**
   * Clean up idle connections from Redis.
   * Runs every 60 seconds and removes connections that have been idle
   * for longer than the configured timeout.
   */
  const cleanupInterval = setInterval(async () => {
    try {
      const now = Date.now()
      const pattern = 'ws:conn:*'
      let connectionsRemoved = 0

      for await (const key of redis.client.scanIterator({ MATCH: pattern })) {
        const data = await redis.get<{ lastActivity: number; startTime: number }>(key)
        if (data && now - data.lastActivity > idleTimeoutInMs) {
          const id = key.replace('ws:conn:', '')
          await releaseConnection(id)
          metrics.increment('ws_idle_timeouts')
          connectionsRemoved++
        }
      }

      // Only observe metric if connections were actually removed
      if (connectionsRemoved > 0) {
        await observeConnectionCount()
      }
    } catch (error: any) {
      logger.error('Error cleaning up idle connections', {
        error: error.message
      })
    }
  }, 60000)

  /**
   * Acquire a connection from Redis.
   * Creates a new connection entry in Redis with the given ID.
   *
   * @param id - The unique connection identifier
   * @throws {Error} If the connection already exists or transaction fails
   */
  async function acquireConnection(id: string) {
    const key = `ws:conn:${id}`
    const startTime = Date.now()

    try {
      // Use a more robust transaction that ensures atomicity
      const result = await redis.client
        .multi()
        .set(key, JSON.stringify({ lastActivity: startTime, startTime }), {
          NX: true,
          EX: Math.ceil(idleTimeoutInMs / 1000)
        })
        .sAdd('ws:conn_ids', id)
        .exec()

      if (!result) {
        throw new Error('Transaction failed')
      }

      // setResult: "OK" if set, null if key exists (NX flag)
      // _addResult: 1 if added, 0 if already in set
      const [setResult, _addResult] = result

      if (!setResult) {
        // Connection already exists
        throw new Error('Connection already exists')
      }

      // Observe the new connection count after successful acquisition
      await observeConnectionCount()

      logger.debug('Connection acquired successfully', {
        connectionId: id
      })
    } catch (error: any) {
      logger.error('Error acquiring connection', {
        connectionId: id,
        error: error.message
      })
      // Clean up any partial state
      await redis.client.multi().del(key).sRem('ws:conn_ids', id).exec()
      throw error
    }
  }

  /**
   * Release a connection from Redis.
   * Removes the connection entry and ID from Redis.
   *
   * @param id - The unique connection identifier
   */
  async function releaseConnection(id: string) {
    try {
      const key = `ws:conn:${id}`
      const endTime = Date.now()
      const connectionData = await redis.get<{ lastActivity: number; startTime: number }>(key)

      // Use transaction to ensure atomic removal
      const result = await redis.client.multi().del(key).sRem('ws:conn_ids', id).exec()

      if (!result) {
        throw new Error('Transaction failed')
      }

      // _deleteResult: 1 if deleted, 0 if key didn't exist
      // removeResult: 1 if removed, 0 if not in set
      const [_deleteResult, removeResult] = result

      if (removeResult === 1) {
        // Connection was successfully removed from set
        await observeConnectionCount()

        logger.debug('Connection released successfully', {
          connectionId: id
        })
      } else {
        logger.warn('Connection was already released or did not exist', {
          connectionId: id
        })
      }

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

  /**
   * Update the activity timestamp for a connection.
   * Extends the connection's TTL and updates the last activity time.
   *
   * @param id - The unique connection identifier
   * @throws {Error} If the connection doesn't exist or update fails
   */
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

  /**
   * Check if a connection is available in Redis.
   *
   * @param id - The unique connection identifier
   * @returns {Promise<boolean>} True if the connection exists, false otherwise
   */
  async function isConnectionAvailable(id: string) {
    return (await redis.client.exists(`ws:conn:${id}`)) === 1
  }

  /**
   * Get the total number of active connections.
   *
   * @returns {Promise<number>} The number of active connections
   */
  async function getActiveConnections(): Promise<number> {
    return await redis.client.sCard('ws:conn_ids')
  }

  /**
   * Clean up all connections and stop the cleanup interval.
   * This is typically called during service shutdown.
   */
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
