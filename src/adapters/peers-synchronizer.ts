import { AppComponents, IPeersSynchronizer } from '../types'
import {
  getPresenceSource,
  PEERS_CACHE_KEY,
  PEERS_CACHE_KEY_PULSE,
  usesArchipelagoPresence,
  usesPulsePresence
} from '../utils/peers'

export const FIVE_SECS_IN_MS = 5000
export const TEN_SECS_IN_MS = 10000

type ReconciliationSource = {
  name: string
  cacheKey: string
  fetchPeers: () => Promise<string[]>
}

/**
 * Reconciles the all-realms peer set every `PEER_SYNC_INTERVAL_MS`. Which sources it polls, and
 * therefore which cache keys it fills, follows `PRESENCE_SOURCE` — in the `both` window it fills
 * `PEERS_CACHE_KEY` from archipelago-stats and `PEERS_CACHE_KEY_PULSE` from Pulse, so the two can
 * be compared under production traffic. See `docs/presence-sources.md`.
 */
export async function createPeersSynchronizerComponent({
  logs,
  archipelagoStats,
  pulseStats,
  redis,
  config
}: Pick<AppComponents, 'logs' | 'archipelagoStats' | 'pulseStats' | 'redis' | 'config'>): Promise<IPeersSynchronizer> {
  const logger = logs.getLogger('peers-synchronizer-component')
  let intervalId: NodeJS.Timeout | null = null
  const syncIntervalMs = (await config.getNumber('PEER_SYNC_INTERVAL_MS')) || FIVE_SECS_IN_MS
  const cacheTTLInSeconds = Math.floor(((await config.getNumber('PEERS_SYNC_CACHE_TTL_MS')) || TEN_SECS_IN_MS) / 1000)
  const presenceSource = await getPresenceSource(config)

  const sources: ReconciliationSource[] = []
  if (usesArchipelagoPresence(presenceSource)) {
    sources.push({
      name: 'archipelago',
      cacheKey: PEERS_CACHE_KEY,
      fetchPeers: () => archipelagoStats.fetchPeers()
    })
  }
  if (usesPulsePresence(presenceSource)) {
    sources.push({
      name: 'pulse',
      cacheKey: PEERS_CACHE_KEY_PULSE,
      fetchPeers: () => pulseStats.fetchPeers()
    })
  }

  async function syncSource(source: ReconciliationSource) {
    try {
      const currentPeers = await source.fetchPeers()

      await redis.put(source.cacheKey, currentPeers, {
        EX: cacheTTLInSeconds
      })
    } catch (error: any) {
      // One failing source must not stop the other from being reconciled.
      logger.error('Error syncing peers:', { source: source.name, error: error.message })
    }
  }

  async function syncPeers() {
    await Promise.all(sources.map(syncSource))
  }

  return {
    async syncPeers() {
      logger.info('Syncing peers', { presenceSource, sources: sources.map((source) => source.name).join(',') })
      await syncPeers()
      intervalId = setInterval(syncPeers, syncIntervalMs)
    },

    async stop() {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
  }
}
