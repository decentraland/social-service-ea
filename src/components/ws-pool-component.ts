import { IMetricsComponent } from '@well-known-components/interfaces'
import { future } from 'fp-future'
import { WsUserData } from '../types'

export type IWSPoolComponent = {
  acquireConnection(id: string): Promise<void>
  releaseConnection(id: string): void
  isConnectionAvailable(id: string): boolean
  getActiveConnections(): number
}

export type WSPoolConfig = {
  maxConcurrentConnections: number
  metrics: IMetricsComponent
}

export async function createWSPoolComponent({
  metrics,
  config
}: Pick<AppComponents, 'metrics' | 'config'>): Promise<IWSPoolComponent> {
  const activeConnections = new Map<string, future<void>>()
  const maxConcurrentConnections = (await config.getNumber('maxConcurrentConnections')) || 100
  const semaphore = createSemaphore(maxConcurrentConnections)

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

function createSemaphore(max: number) {
  let count = 0
  const queue: future<void>[] = []

  return {
    async acquire() {
      if (count >= max) {
        const waiter = future<void>()
        queue.push(waiter)
        await waiter
      }
      count++
    },
    release() {
      count--
      const next = queue.shift()
      if (next) {
        next.resolve()
      }
    }
  }
}
