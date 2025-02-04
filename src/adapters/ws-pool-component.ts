import { future, IFuture } from 'fp-future'
import { Semaphore } from 'async-mutex'
import { AppComponents } from '../types'

export type IWSPoolComponent = {
  acquireConnection(id: string): Promise<void>
  releaseConnection(id: string): void
  updateActivity(id: string): void
  isConnectionAvailable(id: string): boolean
  getActiveConnections(): number
  cleanup(): void
}

export type WSPoolConfig = {
  maxConcurrentConnections?: number
  idleTimeout?: number
}

export async function createWSPoolComponent({
  metrics,
  config
}: Pick<AppComponents, 'metrics' | 'config'>): Promise<IWSPoolComponent> {
  const maxConcurrentConnections = (await config.getNumber('maxConcurrentConnections')) || 100
  const idleTimeout = (await config.getNumber('idleTimeout')) || 300000 // 5 minutes default
  const activeConnections = new Map<
    string,
    {
      future: IFuture<void>
      lastActivity: number
    }
  >()
  const semaphore = new Semaphore(maxConcurrentConnections)

  // Periodic cleanup of idle connections
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [id, connection] of activeConnections.entries()) {
      if (now - connection.lastActivity > idleTimeout) {
        releaseConnection(id)
        metrics.increment('ws_idle_timeouts')
      }
    }
  }, 60000) // Check every minute

  function updateActivity(id: string) {
    const connection = activeConnections.get(id)
    if (connection) {
      connection.lastActivity = Date.now()
    }
  }

  function releaseConnection(id: string) {
    const connection = activeConnections.get(id)
    if (connection) {
      connection.future.resolve()
      activeConnections.delete(id)
      semaphore.release()
      metrics.observe('ws_active_connections', { type: 'total' }, activeConnections.size)
    }
  }

  function cleanup() {
    clearInterval(cleanupInterval)
    // Release all connections
    for (const [id] of activeConnections) {
      releaseConnection(id)
    }
  }

  return {
    async acquireConnection(id: string) {
      await semaphore.acquire()
      const connectionFuture = future<void>()
      activeConnections.set(id, {
        future: connectionFuture,
        lastActivity: Date.now()
      })
      metrics.observe('ws_active_connections', { type: 'total' }, activeConnections.size)
    },

    releaseConnection,

    updateActivity,

    isConnectionAvailable(id: string) {
      return activeConnections.has(id)
    },

    getActiveConnections() {
      return activeConnections.size
    },

    cleanup
  }
}
