import { future, IFuture } from 'fp-future'
import { Semaphore } from 'async-mutex'
import { AppComponents } from '../types'

export type IWSPoolComponent = {
  acquireConnection(id: string): Promise<void>
  releaseConnection(id: string): void
  isConnectionAvailable(id: string): boolean
  getActiveConnections(): number
}

export async function createWSPoolComponent({
  metrics,
  config
}: Pick<AppComponents, 'metrics' | 'config'>): Promise<IWSPoolComponent> {
  const maxConcurrentConnections = (await config.getNumber('maxConcurrentConnections')) || 100
  const activeConnections = new Map<string, IFuture<void>>()
  const semaphore = new Semaphore(maxConcurrentConnections)

  return {
    async acquireConnection(id: string) {
      await semaphore.acquire()
      const connectionFuture = future<void>()
      activeConnections.set(id, connectionFuture)
      metrics.observe('ws_active_connections', { type: 'total' }, activeConnections.size)
    },

    releaseConnection(id: string) {
      const connection = activeConnections.get(id)
      if (connection) {
        connection.resolve()
        activeConnections.delete(id)
        semaphore.release()
        metrics.observe('ws_active_connections', { type: 'total' }, activeConnections.size)
      }
    },

    isConnectionAvailable(id: string) {
      return activeConnections.has(id)
    },

    getActiveConnections() {
      return activeConnections.size
    }
  }
}
