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
        const normalizedAddress = normalizeAddress(address)
        await redis.client.sAdd(WORLD_PEERS_CACHE_KEY, normalizedAddress)
        logger.info('Peer connected to worlds stats', {
          address: normalizedAddress,
          action: 'connect'
        })
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
        const normalizedAddress = normalizeAddress(address)
        await redis.client.sRem(WORLD_PEERS_CACHE_KEY, normalizedAddress)
        logger.info('Peer disconnected from worlds stats', {
          address: normalizedAddress,
          action: 'disconnect'
        })
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
        const peers = await redis.client.sMembers(WORLD_PEERS_CACHE_KEY)
        logger.debug('Retrieved peers from worlds stats cache', {
          peerCount: peers.length,
          peers: peers.slice(0, 5).join(',') // Log first 5 peers
        })
        return peers
      } catch (error: any) {
        logger.error('Error getting world connected peers:', {
          error: error.message
        })
        throw error
      }
    }
  }
}
