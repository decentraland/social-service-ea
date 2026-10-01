import { Subscription } from '@well-known-components/nats-component'
import { IPeerTrackingComponent } from '../types'
import { AppComponents } from '../types'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { ParcelChangesBatch } from '@dcl/pulse-protocol/out-js/decentraland/pulse/pulse_presence.gen'
import { NatsMsg } from '@well-known-components/nats-component/dist/types'
import { COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL, FRIEND_STATUS_UPDATES_CHANNEL } from './pubsub'
import { withoutTracing } from '../utils/tracing'
import { normalizeAddress } from '../utils/address'

/**
 * The one presence feed, per C1: Pulse's `decentraland.pulse.ParcelChangesBatch`, published on this
 * single NATS subject. There is no other subscription and no configurable source.
 */
export const PARCEL_CHANGES_SUBJECT = 'engine.parcel_changes'

export const PEER_STATUS_KEY_PREFIX = 'peer-status:'

/**
 * Upper bound on how many peers of one batch are written and published concurrently. Reads are one
 * MGET per batch, but a publisher-start snapshot can carry a whole Genesis City server, and each
 * flipped peer costs one SET plus two PUBLISH — issuing all of them in a single tick is what this
 * chunk size prevents.
 */
export const STATUS_PUBLISH_CHUNK_SIZE = 100

export type PeerStatusChange = {
  address: string
  status: ConnectivityStatus
}

/**
 * C5, the whole rule: one status event per `ParcelChange`, `parcel` present means the peer stands
 * somewhere and is therefore ONLINE, `parcel` absent means it left that realm/instance and is
 * OFFLINE. `parcel: {}` on the wire decodes to `(0, 0)` — a placement, not an exit.
 *
 * `seq` and `snapshot` are deliberately ignored: a peer that is missing from a snapshot is NOT
 * flipped OFFLINE here, the 5 s `/peers?all=true` poll is what reconciles the full set.
 */
export function parcelChangesToStatusEvents(batch: ParcelChangesBatch): PeerStatusChange[] {
  return batch.changes.map((change) => ({
    address: normalizeAddress(change.address),
    status: change.parcel !== undefined ? ConnectivityStatus.ONLINE : ConnectivityStatus.OFFLINE
  }))
}

export async function createPeerTrackingComponent({
  logs,
  pubsub,
  nats,
  redis,
  config
}: Pick<AppComponents, 'logs' | 'pubsub' | 'nats' | 'redis' | 'config'>): Promise<IPeerTrackingComponent> {
  const logger = logs.getLogger('peer-tracking-component')
  const subscriptions = new Map<string, Subscription>()
  const statusCacheTtlInSeconds = (await config.getNumber('STATUS_CACHE_TTL_IN_SECONDS')) || 3600

  async function readCachedStatuses(addresses: string[]): Promise<(ConnectivityStatus | null)[]> {
    // `redis.mGet` drops nulls, which would break the alignment with `addresses`, so the client's
    // MGET is used directly: one round-trip per batch, one value per requested key.
    const values = await redis.client.mGet(addresses.map((address) => PEER_STATUS_KEY_PREFIX + address))

    return values.map((value) => {
      if (value === null || value === undefined) {
        return null
      }

      try {
        return JSON.parse(value) as ConnectivityStatus
      } catch (error: any) {
        logger.error('Error parsing a cached peer status', { error: error.message })
        return null
      }
    })
  }

  async function applyStatusChange({ address, status }: PeerStatusChange): Promise<void> {
    await redis.put(PEER_STATUS_KEY_PREFIX + address, status, {
      EX: statusCacheTtlInSeconds
    })

    await Promise.all([
      pubsub.publishInChannel(FRIEND_STATUS_UPDATES_CHANNEL, {
        address,
        status
      }),
      pubsub.publishInChannel(COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL, {
        memberAddress: address,
        status
      })
    ])
  }

  /**
   * Reads the cached status of every address in one MGET, then publishes only the peers whose
   * status actually changed. This dedupe is what makes snapshot batches idempotent.
   */
  async function applyStatusChanges(changes: PeerStatusChange[]): Promise<void> {
    if (changes.length === 0) {
      return
    }

    // C1 guarantees one entry per wallet per batch; collapsing defensively keeps the MGET keys
    // unique and the last state winning.
    const latestByAddress = new Map<string, ConnectivityStatus>()
    for (const change of changes) {
      if (!change.address) {
        logger.warn('Ignoring peer status change with empty address')
        continue
      }
      latestByAddress.set(change.address, change.status)
    }

    if (latestByAddress.size === 0) return

    const addresses = [...latestByAddress.keys()]
    const cachedStatuses = await readCachedStatuses(addresses)
    const flipped = addresses
      .map((address, index) => ({ address, status: latestByAddress.get(address)!, cached: cachedStatuses[index] }))
      .filter(({ status, cached }) => cached !== status)

    // Chunked instead of one Promise.all over the whole batch: a first snapshot flips every peer of
    // a server at once and each flip costs one SET plus two PUBLISH.
    for (let offset = 0; offset < flipped.length; offset += STATUS_PUBLISH_CHUNK_SIZE) {
      const results = await Promise.allSettled(
        flipped
          .slice(offset, offset + STATUS_PUBLISH_CHUNK_SIZE)
          .map((change) => applyStatusChange({ address: change.address, status: change.status }))
      )
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failures.length > 0) {
        logger.error('Error applying peer status changes', {
          failedCount: failures.length,
          error: failures[0].reason instanceof Error ? failures[0].reason.message : 'Unknown error'
        })
      }
    }
  }

  /**
   * A non-lowercase realm or address on the wire violates C1 §5. It is logged and the change is
   * still applied against the lowercased address — a producer bug must not cost us presence state.
   */
  function logContractViolations(batch: ParcelChangesBatch): void {
    for (const change of batch.changes) {
      if (change.realm !== change.realm.toLowerCase()) {
        logger.warn('Contract violation: parcel change with a non-canonical realm', {
          realm: change.realm,
          serverName: batch.serverName,
          seq: batch.seq
        })
      }

      if (change.address !== change.address.toLowerCase()) {
        logger.warn('Contract violation: parcel change with a non-canonical address', {
          serverName: batch.serverName,
          seq: batch.seq
        })
      }
    }
  }

  function createParcelChangesHandler() {
    return async (err: Error | null, message: NatsMsg) =>
      withoutTracing(async () => {
        if (err) {
          logger.error('Error processing parcel changes message:', {
            error: err.message,
            subject: PARCEL_CHANGES_SUBJECT
          })
          return
        }

        try {
          const batch = ParcelChangesBatch.decode(new Uint8Array(message.data))

          logContractViolations(batch)

          await applyStatusChanges(parcelChangesToStatusEvents(batch))
        } catch (error: any) {
          logger.error('Error handling parcel changes batch:', {
            error: error.message,
            subject: PARCEL_CHANGES_SUBJECT
          })
        }
      })
  }

  function subscribe(pattern: string, handler: (err: Error | null, message: NatsMsg) => Promise<void>) {
    try {
      subscriptions.set(pattern, nats.subscribe(pattern, handler))
    } catch (error: any) {
      logger.error(`Error subscribing to ${pattern}`, {
        error: error.message
      })
    }
  }

  return {
    async subscribeToPeerStatusUpdates() {
      logger.info('Subscribing to peer status updates', { subject: PARCEL_CHANGES_SUBJECT })

      subscribe(PARCEL_CHANGES_SUBJECT, createParcelChangesHandler())
    },
    async stop() {
      subscriptions.forEach((subscription) => subscription.unsubscribe())
      subscriptions.clear()
    },
    // Exposed for testing
    getSubscriptions() {
      return subscriptions
    }
  }
}
