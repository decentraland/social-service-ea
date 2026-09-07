import { Subscription } from '@well-known-components/nats-component'
import { IPeerTrackingComponent } from '../types'
import { AppComponents } from '../types'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'
import { NatsMsg } from '@well-known-components/nats-component/dist/types'
import { COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL, FRIEND_STATUS_UPDATES_CHANNEL } from './pubsub'
import { normalizeAddress } from '../utils/address'
import {
  getPresenceSource,
  PEERS_CACHE_KEY,
  PEERS_CACHE_KEY_PULSE,
  PresenceSource,
  usesArchipelagoPresence,
  usesPulsePresence
} from '../utils/peers'

export type PeerStatusHandler = {
  event: PeerStatusHandlerEvent
  pattern: string
  status: ConnectivityStatus
}

export enum PeerStatusHandlerEvent {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  HEARTBEAT = 'heartbeat',
  JOIN_WORLD = 'join_world',
  LEAVE_WORLD = 'leave_world'
}

/**
 * @deprecated Iteration 2 / WP4. Superseded by the single `PARCEL_CHANGES_SUBJECT` subscription.
 * Only subscribed when `PRESENCE_SOURCE` is `archipelago` or `both`; deleted at rollout step 8.
 * See `docs/presence-sources.md`.
 */
export const PEER_STATUS_HANDLERS: PeerStatusHandler[] = [
  { event: PeerStatusHandlerEvent.CONNECT, pattern: 'peer.*.connect', status: ConnectivityStatus.OFFLINE },
  { event: PeerStatusHandlerEvent.DISCONNECT, pattern: 'peer.*.disconnect', status: ConnectivityStatus.OFFLINE },
  { event: PeerStatusHandlerEvent.HEARTBEAT, pattern: 'peer.*.heartbeat', status: ConnectivityStatus.ONLINE },
  { event: PeerStatusHandlerEvent.JOIN_WORLD, pattern: 'peer.*.world.join', status: ConnectivityStatus.ONLINE },
  { event: PeerStatusHandlerEvent.LEAVE_WORLD, pattern: 'peer.*.world.leave', status: ConnectivityStatus.OFFLINE }
]

/** The one presence feed: `decentraland.pulse.ParcelChangesBatch` published by Pulse. */
export const PARCEL_CHANGES_SUBJECT = 'engine.parcel_changes'

export const PEER_STATUS_KEY_PREFIX = 'peer-status:'

/**
 * Shadow namespace of the Pulse feed while `PRESENCE_SOURCE=both` (A1), with the same TTL as the
 * live one. Keeping the two dedupe caches apart is what makes `archipelagoFlips` and `pulseFlips`
 * measure each feed's own flip volume instead of which feed won the race.
 */
export const PEER_STATUS_KEY_PREFIX_PULSE = 'peer-status-pulse:'

export const PRESENCE_DIFF_INTERVAL_MS = 60_000

export type PeerStatusChange = {
  address: string
  status: ConnectivityStatus
}

type PresenceFeed = 'archipelago' | 'pulse'

/**
 * How one feed writes. `keyPrefix` is the dedupe namespace it owns and `publishes` says whether its
 * transitions reach the live friend/community channels. A1: in `both` the Pulse feed is a shadow —
 * it derives, dedupes and counts under `peer-status-pulse:` but publishes nothing, so the source
 * still under evaluation cannot put an offline blip in front of a client. In `pulse` it is the only
 * feed and owns the live `peer-status:` namespace.
 */
type PresenceFeedConfig = {
  feed: PresenceFeed
  keyPrefix: string
  publishes: boolean
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
  config,
  worldsStats
}: Pick<
  AppComponents,
  'logs' | 'pubsub' | 'nats' | 'redis' | 'config' | 'worldsStats'
>): Promise<IPeerTrackingComponent> {
  const logger = logs.getLogger('peer-tracking-component')
  const subscriptions = new Map<string, Subscription>()
  const statusCacheTtlInSeconds = (await config.getNumber('STATUS_CACHE_TTL_IN_SECONDS')) || 3600
  const presenceSource = await getPresenceSource(config)

  let diffIntervalId: NodeJS.Timeout | null = null
  const flipsInWindow: Record<PresenceFeed, number> = { archipelago: 0, pulse: 0 }

  const archipelagoFeed: PresenceFeedConfig = {
    feed: 'archipelago',
    keyPrefix: PEER_STATUS_KEY_PREFIX,
    publishes: true
  }
  const pulseFeed: PresenceFeedConfig =
    presenceSource === PresenceSource.BOTH
      ? { feed: 'pulse', keyPrefix: PEER_STATUS_KEY_PREFIX_PULSE, publishes: false }
      : { feed: 'pulse', keyPrefix: PEER_STATUS_KEY_PREFIX, publishes: true }

  async function readCachedStatuses(keyPrefix: string, addresses: string[]): Promise<(ConnectivityStatus | null)[]> {
    // `redis.mGet` drops nulls, which would break the alignment with `addresses`, so the client's
    // MGET is used directly: one round-trip per batch, one value per requested key.
    const values = await redis.client.mGet(addresses.map((address) => keyPrefix + address))

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

  async function applyStatusChange(feed: PresenceFeedConfig, { address, status }: PeerStatusChange): Promise<void> {
    await redis.put(feed.keyPrefix + address, status, {
      EX: statusCacheTtlInSeconds
    })

    // A shadow feed stops here: its status map exists only to count its own flips.
    if (!feed.publishes) {
      return
    }

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
  async function applyStatusChanges(changes: PeerStatusChange[], feed: PresenceFeedConfig): Promise<void> {
    if (changes.length === 0) {
      return
    }

    // C1 guarantees one entry per wallet per batch; collapsing defensively keeps the MGET keys
    // unique and the last state winning.
    const latestByAddress = new Map<string, ConnectivityStatus>()
    for (const change of changes) {
      latestByAddress.set(change.address, change.status)
    }

    const addresses = [...latestByAddress.keys()]
    const cachedStatuses = await readCachedStatuses(feed.keyPrefix, addresses)
    const flipped = addresses
      .map((address, index) => ({ address, status: latestByAddress.get(address)!, cached: cachedStatuses[index] }))
      .filter(({ status, cached }) => cached !== status)

    await Promise.all(flipped.map((change) => applyStatusChange(feed, change)))

    flipsInWindow[feed.feed] += flipped.length
  }

  /**
   * @deprecated Iteration 2 / WP4, see `docs/presence-sources.md`.
   */
  async function updateWorldsStats(peerId: string, handler: PeerStatusHandler) {
    if (handler.event === PeerStatusHandlerEvent.JOIN_WORLD) {
      await worldsStats.onPeerConnect(peerId)
    } else {
      // This works as a backup mechanism to ensure we don't miss a world.leave event
      await worldsStats.onPeerDisconnect(peerId)
    }
  }

  /**
   * @deprecated Iteration 2 / WP4, see `docs/presence-sources.md`.
   */
  async function handlePeerEvent(peerId: string, handler: PeerStatusHandler) {
    try {
      await applyStatusChanges([{ address: peerId, status: handler.status }], archipelagoFeed)
      await updateWorldsStats(peerId, handler)
    } catch (error: any) {
      logger.error('Error handling peer event:', {
        error: error.message,
        peerId,
        event: handler.event
      })
    }
  }

  /**
   * @deprecated Iteration 2 / WP4, see `docs/presence-sources.md`.
   */
  function createMessageHandler(handler: PeerStatusHandler) {
    return async (err: Error | null, message: NatsMsg) => {
      if (err) {
        logger.error(`Error processing peer ${handler.event} message:`, {
          error: err.message,
          pattern: handler.pattern
        })
        return
      }

      const peerId = message.subject.split('.')[1]
      await handlePeerEvent(peerId, handler)
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
    return async (err: Error | null, message: NatsMsg) => {
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

        await applyStatusChanges(parcelChangesToStatusEvents(batch), pulseFeed)
      } catch (error: any) {
        logger.error('Error handling parcel changes batch:', {
          error: error.message,
          subject: PARCEL_CHANGES_SUBJECT
        })
      }
    }
  }

  /**
   * Dual-source window observability: one line per minute, counts only — never addresses.
   * The flip counters are per window and reset on every line.
   */
  async function logPresenceSourceDiff(): Promise<void> {
    try {
      const [archipelagoPeers, pulsePeers] = await Promise.all([
        redis.get<string[]>(PEERS_CACHE_KEY),
        redis.get<string[]>(PEERS_CACHE_KEY_PULSE)
      ])

      const archipelagoSet = new Set(archipelagoPeers ?? [])
      const pulseSet = new Set(pulsePeers ?? [])

      let onlyInArchipelago = 0
      archipelagoSet.forEach((address) => {
        if (!pulseSet.has(address)) {
          onlyInArchipelago++
        }
      })

      let onlyInPulse = 0
      pulseSet.forEach((address) => {
        if (!archipelagoSet.has(address)) {
          onlyInPulse++
        }
      })

      logger.info('Presence source diff', {
        archipelagoPeers: archipelagoSet.size,
        pulsePeers: pulseSet.size,
        onlyInArchipelago,
        onlyInPulse,
        symmetricDifference: onlyInArchipelago + onlyInPulse,
        archipelagoFlips: flipsInWindow.archipelago,
        pulseFlips: flipsInWindow.pulse
      })

      flipsInWindow.archipelago = 0
      flipsInWindow.pulse = 0
    } catch (error: any) {
      logger.error('Error logging the presence source diff', { error: error.message })
    }
  }

  function subscribe(key: string, pattern: string, handler: (err: Error | null, message: NatsMsg) => Promise<void>) {
    try {
      subscriptions.set(key, nats.subscribe(pattern, handler))
    } catch (error: any) {
      logger.error(`Error subscribing to ${pattern}`, {
        error: error.message
      })
    }
  }

  return {
    async subscribeToPeerStatusUpdates() {
      logger.info('Subscribing to peer status updates', { presenceSource })

      if (usesArchipelagoPresence(presenceSource)) {
        PEER_STATUS_HANDLERS.forEach((handler) => {
          subscribe(handler.event, handler.pattern, createMessageHandler(handler))
        })
      }

      if (usesPulsePresence(presenceSource)) {
        subscribe(PARCEL_CHANGES_SUBJECT, PARCEL_CHANGES_SUBJECT, createParcelChangesHandler())
      }

      if (presenceSource === PresenceSource.BOTH) {
        diffIntervalId = setInterval(() => {
          void logPresenceSourceDiff()
        }, PRESENCE_DIFF_INTERVAL_MS)
      }
    },
    async stop() {
      if (diffIntervalId) {
        clearInterval(diffIntervalId)
        diffIntervalId = null
      }
      subscriptions.forEach((subscription) => subscription.unsubscribe())
      subscriptions.clear()
    },
    // Exposed for testing
    getSubscriptions() {
      return subscriptions
    }
  }
}
