import mitt, { Emitter } from 'mitt'
import { ISubscribersContext, Subscribers, SubscriptionEventsEmitter } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { AppComponents } from '../../types/system'

const SUBSCRIBERS_SET_KEY = 'online_subscribers'

export function createSubscribersContext(components: Pick<AppComponents, 'redis' | 'logs'>): ISubscribersContext {
  const { redis, logs } = components
  const logger = logs.getLogger('subscribers-context')

  // Local in-memory emitters for WebSocket connections on this instance
  const localSubscribers: Subscribers = {}

  function addLocalSubscriber(address: string, subscriber: Emitter<SubscriptionEventsEmitter>): void {
    const normalizedAddress = normalizeAddress(address)
    if (!localSubscribers[normalizedAddress]) {
      localSubscribers[normalizedAddress] = subscriber
    }
  }

  function removeLocalSubscriber(address: string): void {
    const normalizedAddress = normalizeAddress(address)
    if (localSubscribers[normalizedAddress]) {
      localSubscribers[normalizedAddress].all.clear()
      delete localSubscribers[normalizedAddress]
    }
  }

  return {
    async start() {
      logger.info('Subscribers context started')
    },

    async stop() {
      // Clean up all local subscribers from Redis on shutdown
      const localAddresses = Object.keys(localSubscribers).map(normalizeAddress)
      if (localAddresses.length > 0) {
        try {
          await redis.sRem(SUBSCRIBERS_SET_KEY, localAddresses)
          logger.info(`Removed ${localAddresses.length} subscribers from Redis on shutdown`)
        } catch (error: any) {
          logger.error('Failed to remove subscribers from Redis on shutdown', { error: error?.message || error })
        }
      }

      // Clear local emitters
      for (const address of Object.keys(localSubscribers)) {
        removeLocalSubscriber(address)
      }
    },

    getSubscribers: () => localSubscribers,

    getLocalSubscribersAddresses: () => Object.keys(localSubscribers).map(normalizeAddress),

    /**
     * Get an existing subscriber without creating one if it doesn't exist.
     * Use this in update handlers to avoid creating orphaned emitters.
     */
    getSubscriber: (address: string): Emitter<SubscriptionEventsEmitter> | undefined => {
      const normalizedAddress = normalizeAddress(address)
      return localSubscribers[normalizedAddress]
    },

    async getSubscribersAddresses(): Promise<string[]> {
      try {
        const addresses = await redis.sMembers(SUBSCRIBERS_SET_KEY)
        return addresses.map(normalizeAddress)
      } catch (error: any) {
        logger.error('Failed to get subscribers from Redis, falling back to local', {
          error: error?.message || error
        })
        // Fallback to local subscribers if Redis fails
        return Object.keys(localSubscribers).map(normalizeAddress)
      }
    },

    getOrAddSubscriber: (address: string): Emitter<SubscriptionEventsEmitter> => {
      const normalizedAddress = normalizeAddress(address)

      if (!localSubscribers[normalizedAddress]) {
        addLocalSubscriber(normalizedAddress, mitt<SubscriptionEventsEmitter>())
        // Also add to Redis for global tracking (fire-and-forget)
        redis.sAdd(SUBSCRIBERS_SET_KEY, normalizedAddress).catch((error: any) => {
          logger.error('Failed to add subscriber to Redis via getOrAddSubscriber', {
            address: normalizedAddress,
            error: error?.message || error
          })
        })
      }

      return localSubscribers[normalizedAddress]
    },

    async addSubscriber(address: string, subscriber: Emitter<SubscriptionEventsEmitter>): Promise<void> {
      const normalizedAddress = normalizeAddress(address)

      // Add to local emitters
      if (!localSubscribers[normalizedAddress]) {
        localSubscribers[normalizedAddress] = subscriber
      }

      // Add to Redis set for global tracking
      try {
        await redis.sAdd(SUBSCRIBERS_SET_KEY, normalizedAddress)
      } catch (error: any) {
        logger.error('Failed to add subscriber to Redis', {
          address: normalizedAddress,
          error: error?.message || error
        })
      }
    },

    async removeSubscriber(address: string): Promise<void> {
      const normalizedAddress = normalizeAddress(address)

      // Remove from local emitters
      removeLocalSubscriber(normalizedAddress)

      // Remove from Redis set
      try {
        await redis.sRem(SUBSCRIBERS_SET_KEY, normalizedAddress)
      } catch (error: any) {
        logger.error('Failed to remove subscriber from Redis', {
          address: normalizedAddress,
          error: error?.message || error
        })
      }
    }
  }
}
