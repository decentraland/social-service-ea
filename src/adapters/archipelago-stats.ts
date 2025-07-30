import { AppComponents, IArchipelagoStatsComponent } from '../types'
import { PEERS_CACHE_KEY } from '../utils/peers'

export async function createArchipelagoStatsComponent({
  logs,
  config,
  fetcher,
  redis
}: Pick<AppComponents, 'logs' | 'config' | 'fetcher' | 'redis'>): Promise<IArchipelagoStatsComponent> {
  const logger = logs.getLogger('archipelago-stats-component')
  const url = await config.getString('ARCHIPELAGO_STATS_URL')

  return {
    async fetchPeers() {
      try {
        const response = await fetcher.fetch(`${url}/peers`)

        if (!response.ok) {
          throw new Error(`Error fetching peers: ${response.statusText}`)
        }

        const { peers } = await response.json()
        const peerIds = peers.map((peer: { id: string }) => peer.id)

        logger.info('Fetched peers from external archipelago service', {
          peerCount: peerIds.length,
          peers: peerIds.slice(0, 5).join(',') // Log first 5 peers
        })

        return peerIds
      } catch (error: any) {
        logger.error(`Error fetching peers from archipelago stats: ${error.message}`)
        throw error
      }
    },
    async getPeers() {
      const cachedPeers = (await redis.get<string[]>(PEERS_CACHE_KEY)) || []
      logger.debug('Retrieved peers from archipelago stats cache', {
        peerCount: cachedPeers.length,
        peers: cachedPeers.slice(0, 5).join(',') // Log first 5 peers
      })
      return cachedPeers
    }
  }
}
