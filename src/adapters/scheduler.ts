import { AppComponents, ISchedulerComponent } from '../types'
import { PEERS_CACHE_KEY } from '../utils/peers'

export const FIVE_SECS_IN_MS = 5000
export const TEN_SECS_IN_MS = 10000

export async function createSchedulerComponent({
  logs,
  archipelagoStats,
  redis,
  config
}: Pick<AppComponents, 'logs' | 'archipelagoStats' | 'redis' | 'config'>): Promise<ISchedulerComponent> {
  const logger = logs.getLogger('scheduler-component')
  let intervalId: NodeJS.Timeout | null = null
  const syncIntervalMs = (await config.getNumber('PEER_SYNC_INTERVAL_MS')) || FIVE_SECS_IN_MS
  const cacheTTLInSeconds = Math.floor(((await config.getNumber('PEERS_CACHE_TTL_MS')) || TEN_SECS_IN_MS) / 1000)

  async function syncPeers() {
    try {
      const currentPeers = await archipelagoStats.getPeers()

      await redis.put(PEERS_CACHE_KEY, JSON.stringify(currentPeers), {
        EX: cacheTTLInSeconds
      })

      logger.debug('Synced peers to Redis', {
        peersCount: Object.keys(currentPeers).length,
        timestamp: Date.now()
      })
    } catch (error: any) {
      logger.error('Error syncing peers:', error)
    }
  }

  return {
    async start() {
      logger.info('Starting scheduler component', { syncIntervalMs })
      await syncPeers()
      intervalId = setInterval(syncPeers, syncIntervalMs)
    },

    async stop() {
      logger.info('Stopping scheduler component')
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
  }
}
