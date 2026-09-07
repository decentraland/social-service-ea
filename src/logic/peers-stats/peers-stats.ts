import { IStatsComponent } from '../../types/components'
import { AppComponents } from '../../types/system'
import { DEFAULT_PRESENCE_SOURCE, PresenceSource } from '../../utils/peers'
import { IPeersStatsComponent } from './types'

/**
 * The online-peer set every read path uses. `PRESENCE_SOURCE` decides which getters feed it:
 * `pulse` reads the single all-realms Pulse set, `archipelago` and `both` keep serving today's
 * union of the archipelago set and the world set, so the dual-source window changes what is
 * *collected*, never what is *served*. See `docs/presence-sources.md`.
 */
export function createPeersStatsComponent(
  components: Pick<AppComponents, 'archipelagoStats' | 'pulseStats' | 'worldsStats'>,
  presenceSource: PresenceSource = DEFAULT_PRESENCE_SOURCE
): IPeersStatsComponent {
  const { archipelagoStats, pulseStats, worldsStats } = components

  const peersGetters: IStatsComponent[] =
    presenceSource === PresenceSource.PULSE ? [pulseStats] : [archipelagoStats, worldsStats]

  return {
    async getConnectedPeers() {
      const peers = await Promise.all(peersGetters.map((peersGetter) => peersGetter.getPeers().catch(() => [])))
      return Array.from(new Set(peers.flat()))
    }
  }
}
