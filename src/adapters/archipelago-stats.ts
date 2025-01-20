import { AppComponents, IArchipelagoStatsComponent } from '../types'

export async function createArchipelagoStatsComponent({
  logs,
  config,
  fetcher
}: Pick<AppComponents, 'logs' | 'config' | 'fetcher'>): Promise<IArchipelagoStatsComponent> {
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

        return peers.reduce((acc: Record<string, boolean>, peer: string) => {
          acc[peer] = true
          return acc
        })
      } catch (error) {
        logger.error(error as any)
        return []
      }
    }
  }
}
