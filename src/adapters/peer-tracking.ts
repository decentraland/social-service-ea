import { Subscription } from '@well-known-components/nats-component'
import { IPeerTrackingComponent } from '../types'
import { AppComponents } from '../types'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { NatsMsg } from '@well-known-components/nats-component/dist/types'
import { FRIEND_STATUS_UPDATES_CHANNEL } from './pubsub'

export type PeerStatusHandler = {
  event: string
  pattern: string
  status: ConnectivityStatus
}

export const PEER_STATUS_HANDLERS: PeerStatusHandler[] = [
  { event: 'connect', pattern: 'peer.*.connect', status: ConnectivityStatus.OFFLINE },
  { event: 'disconnect', pattern: 'peer.*.disconnect', status: ConnectivityStatus.OFFLINE },
  { event: 'heartbeat', pattern: 'peer.*.heartbeat', status: ConnectivityStatus.ONLINE }
]

export function createPeerTrackingComponent({
  logs,
  pubsub,
  nats
}: Pick<AppComponents, 'logs' | 'pubsub' | 'nats'>): IPeerTrackingComponent {
  const logger = logs.getLogger('peer-tracking-component')
  const subscriptions = new Map<string, Subscription>()

  async function notifyPeerStatusChange(peerId: string, status: ConnectivityStatus) {
    try {
      await pubsub.publishInChannel(FRIEND_STATUS_UPDATES_CHANNEL, {
        address: peerId,
        status
      })
    } catch (error: any) {
      logger.error('Error notifying peer status change:', {
        error: error.message,
        peerId,
        status
      })
    }
  }

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
      await notifyPeerStatusChange(peerId, handler.status)
    }
  }

  return {
    async start() {
      PEER_STATUS_HANDLERS.forEach((handler) => {
        const subscription = nats.subscribe(handler.pattern, createMessageHandler(handler))
        subscriptions.set(handler.event, subscription)
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
