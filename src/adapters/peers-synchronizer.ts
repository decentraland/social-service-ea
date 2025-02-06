import { AppComponents, IPeersSynchronizer } from '../types'
import { PEERS_CACHE_KEY } from '../utils/peers'

export const FIVE_SECS_IN_MS = 5000
export const TEN_SECS_IN_MS = 10000

export async function createPeersSynchronizerComponent({
  logs,
  archipelagoStats,
  redis,
  config
}: Pick<AppComponents, 'logs' | 'archipelagoStats' | 'redis' | 'config'>): Promise<IPeersSynchronizer> {
  const logger = logs.getLogger('peers-synchronizer-component')
  let intervalId: NodeJS.Timeout | null = null
  const syncIntervalMs = (await config.getNumber('PEER_SYNC_INTERVAL_MS')) || FIVE_SECS_IN_MS
  const cacheTTLInSeconds = Math.floor(((await config.getNumber('PEERS_SYNC_CACHE_TTL_MS')) || TEN_SECS_IN_MS) / 1000)

  async function syncPeers() {
    try {
      const currentPeers = await archipelagoStats.getPeers()

      await redis.put(PEERS_CACHE_KEY, currentPeers, {
        EX: cacheTTLInSeconds
      })
    } catch (error: any) {
      logger.error('Error syncing peers:', error)
    }
  }

  return {
    async start() {
      await syncPeers()
      intervalId = setInterval(syncPeers, syncIntervalMs)
    },

    async stop() {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
  }
}
