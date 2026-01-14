import { Subscription } from '@well-known-components/nats-component'
import { IPeerTrackingComponent } from '../types'
import { AppComponents } from '../types'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { NatsMsg } from '@well-known-components/nats-component/dist/types'
import { COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL, FRIEND_STATUS_UPDATES_CHANNEL } from './pubsub'
import { withoutTracing } from '../utils/tracing'

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

export const PEER_STATUS_HANDLERS: PeerStatusHandler[] = [
  { event: PeerStatusHandlerEvent.CONNECT, pattern: 'peer.*.connect', status: ConnectivityStatus.OFFLINE },
  { event: PeerStatusHandlerEvent.DISCONNECT, pattern: 'peer.*.disconnect', status: ConnectivityStatus.OFFLINE },
  { event: PeerStatusHandlerEvent.HEARTBEAT, pattern: 'peer.*.heartbeat', status: ConnectivityStatus.ONLINE },
  { event: PeerStatusHandlerEvent.JOIN_WORLD, pattern: 'peer.*.world.join', status: ConnectivityStatus.ONLINE },
  { event: PeerStatusHandlerEvent.LEAVE_WORLD, pattern: 'peer.*.world.leave', status: ConnectivityStatus.OFFLINE }
]

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

  const PEER_STATUS_KEY_PREFIX = 'peer-status:'

  async function notifyPeerStatusChange(peerId: string, status: ConnectivityStatus) {
    const key = PEER_STATUS_KEY_PREFIX + peerId
    const currentStatus = await redis.get<ConnectivityStatus>(key)

    if (currentStatus !== status) {
      await redis.put(key, status, {
        EX: statusCacheTtlInSeconds
      })
      await Promise.all([
        pubsub.publishInChannel(FRIEND_STATUS_UPDATES_CHANNEL, {
          address: peerId,
          status
        }),
        pubsub.publishInChannel(COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL, {
          memberAddress: peerId,
          status
        })
      ])
    }
  }

  async function updateWorldsStats(peerId: string, handler: PeerStatusHandler) {
    if (handler.event === PeerStatusHandlerEvent.JOIN_WORLD) {
      await worldsStats.onPeerConnect(peerId)
    } else {
      // This works as a backup mechanism to ensure we don't miss a world.leave event
      await worldsStats.onPeerDisconnect(peerId)
    }
  }

  async function handlePeerEvent(peerId: string, handler: PeerStatusHandler) {
    try {
      await notifyPeerStatusChange(peerId, handler.status)
      await updateWorldsStats(peerId, handler)
    } catch (error: any) {
      logger.error('Error handling peer event:', {
        error: error.message,
        peerId,
        event: handler.event
      })
    }
  }

  function createMessageHandler(handler: PeerStatusHandler) {
    return async (err: Error | null, message: NatsMsg) => {
      // Suppress tracing for NATS callbacks - they execute in a new async context
      // and would otherwise create standalone Redis transactions
      return withoutTracing(async () => {
        if (err) {
          logger.error(`Error processing peer ${handler.event} message:`, {
            error: err.message,
            pattern: handler.pattern
          })
          return
        }

        const peerId = message.subject.split('.')[1]
        await handlePeerEvent(peerId, handler)
      })
    }
  }

  return {
    async subscribeToPeerStatusUpdates() {
      PEER_STATUS_HANDLERS.forEach((handler) => {
        try {
          const subscription = nats.subscribe(handler.pattern, createMessageHandler(handler))
          subscriptions.set(handler.event, subscription)
        } catch (error: any) {
          logger.error(`Error subscribing to ${handler.pattern}`, {
            error: error.message
          })
        }
      })
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
