import { Subscription } from '@well-known-components/nats-component'
import { IPeerTrackingComponent } from '../types'
import { AppComponents } from '../types'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { NatsMsg } from '@well-known-components/nats-component/dist/types'
import { FRIEND_STATUS_UPDATES_CHANNEL } from './pubsub'

export function createPeerTrackingComponent({
  logs,
  pubsub,
  nats
}: Pick<AppComponents, 'logs' | 'pubsub' | 'nats'>): IPeerTrackingComponent {
  const logger = logs.getLogger('peer-tracking-component')
  let natsSubscriptions: Subscription[] = []

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

  function handleNatsMessage(event: string, status: ConnectivityStatus) {
    return async (err: Error | null, message: NatsMsg) => {
      if (err) {
        logger.error(`Error processing peer ${event} message: ${err.message}`)
        return
      }

      const peerId = message.subject.split('.')[1]
      await notifyPeerStatusChange(peerId, status)
    }
  }

  return {
    async start() {
      natsSubscriptions.push(
        nats.subscribe('peer.*.connect', handleNatsMessage('connect', ConnectivityStatus.OFFLINE)),
        nats.subscribe('peer.*.disconnect', handleNatsMessage('disconnect', ConnectivityStatus.OFFLINE)),
        nats.subscribe('peer.*.heartbeat', handleNatsMessage('heartbeat', ConnectivityStatus.ONLINE))
      )
    },
    async stop() {
      natsSubscriptions.forEach((subscription) => subscription.unsubscribe())
      natsSubscriptions = []
    }
  }
}
