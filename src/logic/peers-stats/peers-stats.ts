import { IStatsComponent } from '../../types/components'
import { AppComponents } from '../../types/system'
import { IPeersStatsComponent } from './types'

export function createPeersStatsComponent(
  components: Pick<AppComponents, 'archipelagoStats' | 'worldsStats'>
): IPeersStatsComponent {
  const { archipelagoStats, worldsStats } = components

  return {
    async getConnectedPeers() {
      const peersGetters: IStatsComponent[] = [archipelagoStats, worldsStats]
      const peers = await Promise.all(peersGetters.map((peersGetter) => peersGetter.getPeers().catch(() => [])))
      return Array.from(new Set(peers.flat()))
    }
  }
}
