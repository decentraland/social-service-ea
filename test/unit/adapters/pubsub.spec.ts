import { createPubSubComponent } from '../../../src/adapters/pubsub'
import { mockLogs, mockRedis } from '../../mocks/components'
import { FRIEND_STATUS_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { IPubSubComponent } from '../../../src/types'
import { RedisClientType } from 'redis'

describe('PubSubComponent', () => {
  let pubsub: IPubSubComponent

  let mockSubClient: jest.Mocked<RedisClientType>
  let mockPubClient: jest.Mocked<RedisClientType>

  beforeEach(() => {
    pubsub = createPubSubComponent({
      logs: mockLogs,
      redis: mockRedis
    })

    mockSubClient = mockRedis.client.duplicate() as jest.Mocked<RedisClientType>
    mockPubClient = mockRedis.client.duplicate() as jest.Mocked<RedisClientType>
  })

  describe('publishInChannel', () => {
    it('should publish friend status updates', async () => {
      const update = {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      }

      await pubsub.publishInChannel(FRIEND_STATUS_UPDATES_CHANNEL, update)

      expect(mockPubClient.publish).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, JSON.stringify(update))
    })

    it('should publish friendship updates', async () => {
      const update = {
        userAddress: '0x123',
        friendAddress: '0x456',
        action: 'REQUEST'
      }

      await pubsub.publishInChannel(FRIENDSHIP_UPDATES_CHANNEL, update)

      expect(mockPubClient.publish).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, JSON.stringify(update))
    })

    it('should handle publish errors gracefully', async () => {
      const error = new Error('Redis publish error')
      mockPubClient.publish.mockRejectedValueOnce(error)

      const update = {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      }

      await pubsub.publishInChannel(FRIEND_STATUS_UPDATES_CHANNEL, update)

      expect(mockLogs.getLogger('pubsub-component').error).toHaveBeenCalledWith(
        `Error while publishing update to channel ${FRIEND_STATUS_UPDATES_CHANNEL}: ${error.message}`
      )
    })
  })

  describe('subscribeToChannel', () => {
    it('should subscribe to friend status updates', async () => {
      const handler = jest.fn()
      await pubsub.subscribeToChannel(FRIEND_STATUS_UPDATES_CHANNEL, handler)

      expect(mockSubClient.subscribe).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, handler)
    })

    it('should subscribe to friendship updates', async () => {
      const handler = jest.fn()
      await pubsub.subscribeToChannel(FRIENDSHIP_UPDATES_CHANNEL, handler)

      expect(mockSubClient.subscribe).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, handler)
    })

    it('should handle subscription errors gracefully', async () => {
      const error = new Error('Redis subscribe error')
      mockSubClient.subscribe.mockRejectedValueOnce(error)

      const handler = jest.fn()
      await pubsub.subscribeToChannel(FRIEND_STATUS_UPDATES_CHANNEL, handler)

      expect(mockLogs.getLogger('pubsub-component').error).toHaveBeenCalledWith(
        `Error while subscribing to channel ${FRIEND_STATUS_UPDATES_CHANNEL}: ${error.message}`
      )
    })

    it('should not call handler when subscription fails', async () => {
      const error = new Error('Redis subscribe error')
      mockSubClient.subscribe.mockRejectedValueOnce(error)

      const handler = jest.fn()
      await pubsub.subscribeToChannel(FRIEND_STATUS_UPDATES_CHANNEL, handler)

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('start/stop', () => {
    it('should connect on start if redis is not ready', async () => {
      Object.defineProperty(mockSubClient, 'isReady', { value: false, writable: true })
      Object.defineProperty(mockPubClient, 'isReady', { value: false, writable: true })

      await pubsub.start({} as any)

      expect(mockSubClient.connect).toHaveBeenCalled()
      expect(mockPubClient.connect).toHaveBeenCalled()
    })

    it('should do nothing on start if redis is already connected', async () => {
      Object.defineProperty(mockSubClient, 'isReady', { value: true, writable: true })
      Object.defineProperty(mockPubClient, 'isReady', { value: true, writable: true })

      await pubsub.start({} as any)

      expect(mockSubClient.connect).not.toHaveBeenCalled()
      expect(mockPubClient.connect).not.toHaveBeenCalled()
    })

    it('should disconnect on stop if redis is ready', async () => {
      Object.defineProperty(mockSubClient, 'isReady', { value: true, writable: true })
      Object.defineProperty(mockPubClient, 'isReady', { value: true, writable: true })

      await pubsub.stop()
      expect(mockSubClient.unsubscribe).toHaveBeenCalled()
      expect(mockSubClient.disconnect).toHaveBeenCalled()
      expect(mockPubClient.disconnect).toHaveBeenCalled()
    })

    it('should not disconnect if redis is not ready', async () => {
      Object.defineProperty(mockSubClient, 'isReady', { value: false, writable: true })
      Object.defineProperty(mockPubClient, 'isReady', { value: false, writable: true })

      await pubsub.stop()
      expect(mockSubClient.unsubscribe).not.toHaveBeenCalled()
      expect(mockSubClient.disconnect).not.toHaveBeenCalled()
      expect(mockPubClient.disconnect).not.toHaveBeenCalled()
    })
  })
})
