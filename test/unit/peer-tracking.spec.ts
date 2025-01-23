import { createPeerTrackingComponent, PEER_STATUS_HANDLERS } from '../../src/adapters/peer-tracking'
import { FRIEND_STATUS_UPDATES_CHANNEL } from '../../src/adapters/pubsub'
import { mockLogs, mockNats, mockPubSub } from '../mocks/components'
import { IPeerTrackingComponent } from '../../src/types'

describe('PeerTrackingComponent', () => {
  let peerTracking: IPeerTrackingComponent

  beforeEach(() => {
    jest.clearAllMocks()
    peerTracking = createPeerTrackingComponent({ logs: mockLogs, nats: mockNats, pubsub: mockPubSub })
  })

  describe('start', () => {
    it('should subscribe to all peer status patterns', async () => {
      await peerTracking.subscribeToPeerStatusUpdates()

      const subscriptions = peerTracking.getSubscriptions()
      expect(subscriptions.size).toBe(PEER_STATUS_HANDLERS.length)

      PEER_STATUS_HANDLERS.forEach((handler) => {
        expect(mockNats.subscribe).toHaveBeenCalledWith(handler.pattern, expect.any(Function))
        expect(subscriptions.has(handler.event)).toBe(true)
      })
    })
  })

  describe('stop', () => {
    it('should unsubscribe and clear all subscriptions', async () => {
      await peerTracking.subscribeToPeerStatusUpdates()
      await peerTracking.stop()

      const subscriptions = peerTracking.getSubscriptions()
      expect(subscriptions.size).toBe(0)
    })
  })

  describe('message handling', () => {
    PEER_STATUS_HANDLERS.forEach((handler) => {
      it(`should handle ${handler.event} messages correctly`, async () => {
        await peerTracking.subscribeToPeerStatusUpdates()

        const messageHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === handler.pattern)?.[1]

        expect(messageHandler).toBeDefined()

        await messageHandler(null, {
          subject: `peer.0x123.${handler.event}`,
          data: undefined
        })

        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, {
          address: '0x123',
          status: handler.status
        })
      })

      it(`should handle ${handler.event} message errors`, async () => {
        await peerTracking.subscribeToPeerStatusUpdates()

        const messageHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === handler.pattern)?.[1]

        const error = new Error('Test error')
        await messageHandler(error, {
          subject: `peer.0x123.${handler.event}`,
          data: undefined
        })

        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
      })
    })
  })
})
