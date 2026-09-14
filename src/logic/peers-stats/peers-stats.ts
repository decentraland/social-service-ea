import { AppComponents } from '../../types/system'
import { IPeersStatsComponent } from './types'

/**
 * The online-peer set every read path uses: Pulse's reconciled all-realms set, the one presence
 * source. A transient read failure must not fail the callers that build on this (friend lists,
 * community member lists), so it degrades to an empty set instead of throwing.
 */
export function createPeersStatsComponent(components: Pick<AppComponents, 'pulseStats'>): IPeersStatsComponent {
  const { pulseStats } = components

  return {
    async getConnectedPeers() {
      const peers = await pulseStats.getPeers().catch(() => [])
      return Array.from(new Set(peers))
    }
  }
}
