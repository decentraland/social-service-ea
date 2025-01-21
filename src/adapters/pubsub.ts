import { AppComponents, IPubSubComponent } from '../types'

export const FRIENDSHIP_UPDATES_CHANNEL = 'FRIENDSHIP_UPDATES'
export const FRIEND_STATUS_UPDATES_CHANNEL = 'FRIEND_STATUS_UPDATES'

export default function createPubSubComponent(components: Pick<AppComponents, 'logs' | 'redis'>): IPubSubComponent {
  const { logs, redis } = components
  const logger = logs.getLogger('pubsub-component')

  const subClient = redis.client.duplicate()
  const pubClient = redis.client.duplicate()

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
    async subscribeToChannel(channel: string, cb: (message: string) => void) {
      try {
        await subClient.subscribe(channel, cb)
      } catch (error: any) {
        logger.error(`Error while subscribing to channel ${channel}: ${error.message}`)
      }
    },
    async publishInChannel<T>(channel: string, update: T) {
      try {
        const message = JSON.stringify(update)
        logger.debug(`Publishing update to channel ${channel}:`, { update: message })
        await pubClient.publish(channel, message)
      } catch (error) {
        logger.error(error as any)
      }
    }
  }
}
