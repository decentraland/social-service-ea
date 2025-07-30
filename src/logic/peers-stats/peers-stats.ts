import { IStatsComponent } from '../../types/components'
import { AppComponents } from '../../types/system'
import { IPeersStatsComponent } from './types'

export function createPeersStatsComponent(
  components: Pick<AppComponents, 'archipelagoStats' | 'worldsStats' | 'logs'>
): IPeersStatsComponent {
  const { archipelagoStats, worldsStats, logs } = components
  const logger = logs.getLogger('peers-stats-component')

  return {
    async getConnectedPeers() {
      try {
        // Get peers from both sources
        const [archipelagoPeers, worldsPeers] = await Promise.all([
          archipelagoStats.getPeers().catch(() => []),
          worldsStats.getPeers().catch(() => [])
        ])

        logger.debug(`Retrieved ${archipelagoPeers.length} peers from archipelago stats`, {
          source: 'archipelago',
          peerCount: archipelagoPeers.length,
          peers: archipelagoPeers.slice(0, 5).join(',')
        })

        logger.debug(`Retrieved ${worldsPeers.length} peers from worlds stats`, {
          source: 'worlds',
          peerCount: worldsPeers.length,
          peers: worldsPeers.slice(0, 5).join(',')
        })

        // Prioritize worlds stats (WebSocket connections) over archipelago stats
        // This ensures that real-time connections are not overridden by stale external data
        const combinedPeers = Array.from(new Set([...worldsPeers, ...archipelagoPeers]))

        logger.info(`Combined peer stats (worlds stats prioritized)`, {
          archipelagoPeers: archipelagoPeers.length,
          worldsPeers: worldsPeers.length,
          combinedPeers: combinedPeers.length,
          uniquePeers: combinedPeers.slice(0, 5).join(',')
        })

        return combinedPeers
      } catch (error) {
        logger.error('Error in getConnectedPeers', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        return []
      }
    }
  }
}
