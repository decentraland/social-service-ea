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
    async getPeers() {
      try {
        const response = await fetcher.fetch(`${url}/comms/peers`)

        if (!response.ok) {
          throw new Error(`Error fetching peers: ${response.statusText}`)
        }

        const { peers } = await response.json()

        return peers.map((peer: { id: string }) => peer.id)
      } catch (error) {
        logger.error(error as any)
        return []
      }
    },
    async getPeersFromCache() {
      return (await redis.get<string[]>(PEERS_CACHE_KEY)) || []
    }
  }
}
