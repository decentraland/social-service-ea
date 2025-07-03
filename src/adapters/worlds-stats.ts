import { AppComponents, IWorldsStatsComponent } from '../types'
import { WORLD_PEERS_CACHE_KEY } from '../utils/peers'
import { normalizeAddress } from '../utils/address'

export async function createWorldsStatsComponent({
  logs,
  redis
}: Pick<AppComponents, 'logs' | 'redis'>): Promise<IWorldsStatsComponent> {
  const logger = logs.getLogger('worlds-stats-component')

  return {
    async onPeerConnect(address: string): Promise<void> {
      try {
        await redis.addToSet(WORLD_PEERS_CACHE_KEY, normalizeAddress(address))
      } catch (error: any) {
        logger.error('Error handling peer connection:', {
          error: error.message,
          address
        })
        throw error
      }
    },

    async onPeerDisconnect(address: string): Promise<void> {
      try {
        await redis.removeFromSet(WORLD_PEERS_CACHE_KEY, normalizeAddress(address))
      } catch (error: any) {
        logger.error('Error handling peer disconnection:', {
          error: error.message,
          address
        })
        throw error
      }
    },

    async getPeers(): Promise<string[]> {
      try {
        return await redis.listSetMembers(WORLD_PEERS_CACHE_KEY)
      } catch (error: any) {
        logger.error('Error getting world connected peers:', {
          error: error.message
        })
        throw error
      }
    }
  }
}
