import { AppComponents, IWorldsStatsComponent } from '../types'
import { WORLD_PEERS_CACHE_KEY } from '../utils/peers'
import { normalizeAddress } from '../utils/address'

export async function createWorldsStatsComponent({
  logs,
  redis,
  config
}: Pick<AppComponents, 'logs' | 'redis' | 'config'>): Promise<IWorldsStatsComponent> {
  const logger = logs.getLogger('worlds-stats-component')
  const worldUsersTtlInSeconds = (await config.getNumber('WORLD_USERS_TTL_IN_SECONDS')) || 3600

  return {
    async onPeerConnect(address: string): Promise<void> {
      try {
        await redis.client.sAdd(WORLD_PEERS_CACHE_KEY, normalizeAddress(address))
        // Set TTL for the entire set to handle edge cases where users don't properly disconnect
        await redis.client.expire(WORLD_PEERS_CACHE_KEY, worldUsersTtlInSeconds)
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
        await redis.client.sRem(WORLD_PEERS_CACHE_KEY, normalizeAddress(address))
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
        return await redis.client.sMembers(WORLD_PEERS_CACHE_KEY)
      } catch (error: any) {
        logger.error('Error getting world connected peers:', {
          error: error.message
        })
        return []
      }
    }
  }
}
