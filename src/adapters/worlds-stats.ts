import { AppComponents, IWorldsStatsComponent } from '../types'
import { WORLD_PEERS_CACHE_KEY } from '../utils/peers'
import { normalizeAddress } from '../utils/address'

/**
 * @deprecated Iteration 2 / WP4. Pulse's `engine.parcel_changes` feed carries the realm of every
 * peer and `GET /peers?all=true` already covers worlds, so the separate world-peer set and the
 * `peer.*.world.*` handlers that fill it are redundant. Only exercised when `PRESENCE_SOURCE` is
 * `archipelago` or `both`; deleted at rollout step 8. See `docs/presence-sources.md`.
 */
export async function createWorldsStatsComponent({
  logs,
  redis
}: Pick<AppComponents, 'logs' | 'redis'>): Promise<IWorldsStatsComponent> {
  const logger = logs.getLogger('worlds-stats-component')

  return {
    async onPeerConnect(address: string): Promise<void> {
      try {
        await redis.client.sAdd(WORLD_PEERS_CACHE_KEY, normalizeAddress(address))
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
        throw error
      }
    }
  }
}
