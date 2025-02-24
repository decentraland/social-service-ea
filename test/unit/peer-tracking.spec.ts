import { createPeerTrackingComponent, PEER_STATUS_HANDLERS } from '../../src/adapters/peer-tracking'
import { FRIEND_STATUS_UPDATES_CHANNEL } from '../../src/adapters/pubsub'
import { mockConfig, mockLogs, mockNats, mockPubSub, mockRedis } from '../mocks/components'
import { IPeerTrackingComponent } from '../../src/types'
import { mockWorldsStats } from '../mocks/components/worlds-stats'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

describe('PeerTrackingComponent', () => {
  let peerTracking: IPeerTrackingComponent

  beforeEach(async () => {
    jest.clearAllMocks()
    peerTracking = await createPeerTrackingComponent({
      logs: mockLogs,
      nats: mockNats,
      pubsub: mockPubSub,
      redis: mockRedis,
      config: mockConfig,
      worldsStats: mockWorldsStats
    })
  })

  describe('subscribeToPeerStatusUpdates', () => {
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
      it(`should handle ${handler.event} messages and update cache only when status changes`, async () => {
        await peerTracking.subscribeToPeerStatusUpdates()

        const messageHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === handler.pattern)?.[1]
        expect(messageHandler).toBeDefined()

        mockRedis.get.mockResolvedValueOnce(null)

        await messageHandler(null, {
          subject: `peer.0x123.${handler.event}`,
          data: undefined
        })

        expect(mockRedis.put).toHaveBeenCalledWith('peer-status:0x123', handler.status, expect.any(Object))
        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, {
          address: '0x123',
          status: handler.status
        })

        jest.clearAllMocks()

        mockRedis.get.mockResolvedValueOnce(handler.status)

        await messageHandler(null, {
          subject: `peer.0x123.${handler.event}`,
          data: undefined
        })

        expect(mockRedis.put).not.toHaveBeenCalled()
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
      })

      it(`should handle ${handler.event} message errors`, async () => {
        await peerTracking.subscribeToPeerStatusUpdates()

        const messageHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === handler.pattern)?.[1]

        const error = new Error('Test error')
        await messageHandler(error, {
          subject: `peer.0x123.${handler.event}`,
          data: undefined
        })

        expect(mockRedis.put).not.toHaveBeenCalled()
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
      })

      it(`should handle Redis errors gracefully`, async () => {
        await peerTracking.subscribeToPeerStatusUpdates()

        const messageHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === handler.pattern)?.[1]

        mockRedis.get.mockRejectedValueOnce(new Error('Redis error'))

        await messageHandler(null, {
          subject: `peer.0x123.${handler.event}`,
          data: undefined
        })

        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
      })
    })
  })

  describe('subscribeToPeerStatusUpdates', () => {
    it('should handle subscription errors gracefully', async () => {
      // Mock nats.subscribe to throw an error for one of the patterns
      const subscribeError = new Error('NATS subscription failed')
      mockNats.subscribe.mockImplementationOnce(() => {
        throw subscribeError
      })

      await peerTracking.subscribeToPeerStatusUpdates()

      // Verify error was logged
      expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalledWith(
        `Error subscribing to ${PEER_STATUS_HANDLERS[0].pattern}`,
        {
          error: subscribeError.message
        }
      )

      // Verify other subscriptions were still created
      const subscriptions = peerTracking.getSubscriptions()
      expect(subscriptions.size).toBe(PEER_STATUS_HANDLERS.length - 1)
    })
  })

  describe('world events handling', () => {
    it('should handle join_world event and notify world stats', async () => {
      await peerTracking.subscribeToPeerStatusUpdates()

      const joinWorldHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === 'peer.*.world.join')?.[1]
      expect(joinWorldHandler).toBeDefined()

      mockRedis.get.mockResolvedValueOnce(null)

      await joinWorldHandler(null, {
        subject: 'peer.0x123.world.join',
        data: undefined
      })

      // Verify status update
      expect(mockRedis.put).toHaveBeenCalledWith('peer-status:0x123', ConnectivityStatus.ONLINE, expect.any(Object))
      expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      })

      // Verify world stats update
      expect(mockWorldsStats.onPeerConnect).toHaveBeenCalledWith('0x123')
    })

    it('should handle leave_world event and notify world stats', async () => {
      await peerTracking.subscribeToPeerStatusUpdates()

      const leaveWorldHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === 'peer.*.world.leave')?.[1]
      expect(leaveWorldHandler).toBeDefined()

      mockRedis.get.mockResolvedValueOnce(null)

      await leaveWorldHandler(null, {
        subject: 'peer.0x123.world.leave',
        data: undefined
      })

      // Verify status update
      expect(mockRedis.put).toHaveBeenCalledWith('peer-status:0x123', ConnectivityStatus.OFFLINE, expect.any(Object))
      expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, {
        address: '0x123',
        status: ConnectivityStatus.OFFLINE
      })

      // Verify world stats update
      expect(mockWorldsStats.onPeerDisconnect).toHaveBeenCalledWith('0x123')
    })

    it('should handle world stats errors gracefully', async () => {
      await peerTracking.subscribeToPeerStatusUpdates()

      const joinWorldHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === 'peer.*.world.join')?.[1]
      expect(joinWorldHandler).toBeDefined()

      mockRedis.get.mockResolvedValueOnce(null)
      mockWorldsStats.onPeerConnect.mockRejectedValueOnce(new Error('World stats error'))

      await joinWorldHandler(null, {
        subject: 'peer.0x123.world.join',
        data: undefined
      })

      // Status updates should still work even if world stats fails
      expect(mockRedis.put).toHaveBeenCalledWith('peer-status:0x123', ConnectivityStatus.ONLINE, expect.any(Object))
      expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      })

      // Verify error was logged
      expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalledWith(
        'Error handling world event:',
        expect.objectContaining({
          error: 'World stats error',
          peerId: '0x123'
        })
      )
    })

    it('should not call world stats for non-world events', async () => {
      await peerTracking.subscribeToPeerStatusUpdates()

      const heartbeatHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === 'peer.*.heartbeat')?.[1]
      expect(heartbeatHandler).toBeDefined()

      mockRedis.get.mockResolvedValueOnce(null)

      await heartbeatHandler(null, {
        subject: 'peer.0x123.heartbeat',
        data: undefined
      })

      expect(mockWorldsStats.onPeerConnect).not.toHaveBeenCalled()
      expect(mockWorldsStats.onPeerDisconnect).not.toHaveBeenCalled()
    })
  })
})
