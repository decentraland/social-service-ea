import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents, SubscriptionEventsEmitter } from '../types'

const FRIENDSHIP_UPDATES_CHANNEL = 'FRIENDSHIP_UPDATES'

export type IPubSubComponent = IBaseComponent & {
  subscribeToFriendshipUpdates(cb: (message: string) => void): Promise<void>
  publishFriendshipUpdate(update: SubscriptionEventsEmitter['update']): Promise<void>
}

export default function createPubSubComponent(components: Pick<AppComponents, 'logs' | 'redis'>): IPubSubComponent {
  const { logs, redis } = components
  const logger = logs.getLogger('pubsub-component')

  const subClient = redis.client.duplicate()
  const pubClient = redis.client.duplicate()

  let friendshipUpdatesCb: (message: string) => void | undefined

  return {
    async start() {
      if (!subClient.isReady) {
        await subClient.connect()
      }

      if (!pubClient.isReady) {
        await pubClient.connect()
      }
    },
    async stop() {
      if (subClient.isReady) {
        await subClient.disconnect()
      }

      if (pubClient.isReady) {
        await pubClient.disconnect()
      }
    },
    async subscribeToFriendshipUpdates(cb) {
      try {
        friendshipUpdatesCb = cb
        await subClient.subscribe(FRIENDSHIP_UPDATES_CHANNEL, friendshipUpdatesCb)
      } catch (error) {
        logger.error(error as any)
      }
    },
    async publishFriendshipUpdate(update) {
      try {
        const message = JSON.stringify(update)
        logger.debug('publishing update to FRIENDSHIP_UPDATES > ', { update: message })
        await pubClient.publish(FRIENDSHIP_UPDATES_CHANNEL, message)
      } catch (error) {
        logger.error(error as any)
      }
    }
  }
}
