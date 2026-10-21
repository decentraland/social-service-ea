import { AppComponents, IPulseStatsComponent } from '../types'
import { normalizeAddress } from '../utils/address'
import { PEERS_CACHE_KEY } from '../utils/peers'
import { fetchJson } from '../utils/fetch'

/**
 * A2: presence of the key is not enough. `.env.default` ships inside the image and is a live config
 * source (`src/components.ts` loads `['.env.default', '.env']` with the process cwd at `/app`), so a
 * placeholder — or an operator's empty string, or a bare hostname — would satisfy `requireString`
 * and leave the loud boot failure unreachable exactly where it matters. Validate the resolved value.
 *
 * The value itself is never put in the message: a URL is not this service's secret to print.
 */
function assertAbsoluteHttpUrl(key: string, value: string): string {
  let protocol: string

  try {
    protocol = new URL(value).protocol
  } catch {
    throw new Error(`Configuration: ${key} must be an absolute http(s) URL`)
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Configuration: ${key} must be an absolute http(s) URL`)
  }

  return value
}

/**
 * The one reconciliation source: Pulse's all-realms peer list.
 *
 * `GET /peers?all=true` is the unfiltered, every-realm view (worlds included), which is why this
 * needs no separate world-peer bookkeeping. Shape:
 * `{ ok: true, peers: [{ id, address, lastPing, parcel, position, realm }] }`.
 */
export async function createPulseStatsComponent({
  logs,
  config,
  fetcher,
  redis
}: Pick<AppComponents, 'logs' | 'config' | 'fetcher' | 'redis'>): Promise<IPulseStatsComponent> {
  const logger = logs.getLogger('pulse-stats-component')
  // A2: Pulse is the only presence source, so a missing URL is a total presence outage whose only
  // symptom would otherwise be a fetch error every 5 s — this is a loud boot failure instead.
  const url = assertAbsoluteHttpUrl('PULSE_URL', await config.requireString('PULSE_URL'))

  return {
    async fetchPeers() {
      try {
        const { peers } = await fetchJson<{ peers: { id: string }[] }>(
          () => fetcher.fetch(`${url}/peers?all=true`),
          (response) => new Error(`Error fetching peers: ${response.statusText}`)
        )

        // Pulse canonicalizes at ingest, but the peer set feeds address comparisons everywhere else
        // in this service, so normalize defensively instead of trusting the wire.
        return (peers ?? []).map((peer: { id: string }) => normalizeAddress(peer.id))
      } catch (error: any) {
        logger.error(`Error fetching peers from pulse: ${error.message}`)
        throw error
      }
    },
    async getPeers() {
      return (await redis.get<string[]>(PEERS_CACHE_KEY)) || []
    }
  }
}
