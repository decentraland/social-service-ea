import { future, IFuture } from 'fp-future'
import { Semaphore } from 'async-mutex'
import { AppComponents } from '../types'

export type IWSPoolComponent = {
  acquireConnection(id: string): Promise<void>
  releaseConnection(id: string): void
  isConnectionAvailable(id: string): boolean
  getActiveConnections(): number
}

export type WSPoolConfig = {
  maxConcurrentConnections?: number
  connectionTimeout?: number
}

export async function createWSPoolComponent({
  metrics,
  config
}: Pick<AppComponents, 'metrics' | 'config'>): Promise<IWSPoolComponent> {
  const maxConcurrentConnections = (await config.getNumber('maxConcurrentConnections')) || 100
  const connectionTimeout = (await config.getNumber('connectionTimeout')) || 60000 // 1 minute default
  const activeConnections = new Map<string, IFuture<void>>()
  const connectionTimers = new Map<string, NodeJS.Timeout>()
  const semaphore = new Semaphore(maxConcurrentConnections)

  function clearConnectionTimer(id: string) {
    const timer = connectionTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      connectionTimers.delete(id)
    }
  }

  function releaseConnection(id: string) {
    const connection = activeConnections.get(id)
    if (connection) {
      clearConnectionTimer(id)
      connection.resolve()
      activeConnections.delete(id)
      semaphore.release()
      metrics.observe('ws_active_connections', { type: 'total' }, activeConnections.size)
    }
  }

  return {
    async acquireConnection(id: string) {
      await semaphore.acquire()
      const connectionFuture = future<void>()
      activeConnections.set(id, connectionFuture)

      // Set connection timeout
      const timer = setTimeout(() => {
        releaseConnection(id)
      }, connectionTimeout)
      connectionTimers.set(id, timer)

      metrics.observe('ws_active_connections', { type: 'total' }, activeConnections.size)
    },

    releaseConnection,

    isConnectionAvailable(id: string) {
      return activeConnections.has(id)
    },

    getActiveConnections() {
      return activeConnections.size
    }
  }
}
