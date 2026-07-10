import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext } from '../../../../../src/types'
import {
  mockFriendsDB,
  createMockPeersStatsComponent,
  createMockUpdateHandlerComponent,
  mockRegistry
} from '../../../../mocks/components'
import { subscribeToFriendConnectivityUpdatesService } from '../../../../../src/controllers/handlers/rpc/subscribe-to-friend-connectivity-updates'
import {
  ConnectivityStatus,
  SubscriptionStreamClosed,
  SubscriptionStreamClosedReason
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfileToFriend } from '../../../../../src/logic/friends'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { mockMetrics } from '../../../../mocks/components/metrics'
import { mockConfig } from '../../../../mocks/components/config'
import { createWsPoolMockedComponent } from '../../../../mocks/components/ws-pool'
import { IPeersStatsComponent } from '../../../../../src/logic/peers-stats'
import { ILoggerComponent } from '@well-known-components/interfaces'

describe('when subscribing to friend connectivity updates', () => {
  let subscribeToFriendConnectivityUpdates: ReturnType<typeof subscribeToFriendConnectivityUpdatesService>
  let rpcContext: RpcServerContext
  let mockUpdateHandler: jest.Mocked<any>
  let mockPeersStats: jest.Mocked<IPeersStatsComponent>
  let subscribersContext: any
  let mockFriendProfile: any
  let logs: jest.Mocked<ILoggerComponent>

  const friend = {
    address: '0x456'
  }

  beforeEach(() => {
    logs = createLogsMockedComponent()
    subscribersContext = createSubscribersContext(
      { logs, metrics: mockMetrics, config: mockConfig },
      createWsPoolMockedComponent()
    )
    mockUpdateHandler = createMockUpdateHandlerComponent({})
    mockPeersStats = createMockPeersStatsComponent()
    mockFriendProfile = createMockProfile('0x456')

    subscribeToFriendConnectivityUpdates = subscribeToFriendConnectivityUpdatesService({
      components: {
        logs,
        friendsDb: mockFriendsDB,
        registry: mockRegistry,
        peersStats: mockPeersStats,
        updateHandler: mockUpdateHandler
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  describe('when receiving live updates', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          friend: parseProfileToFriend(mockFriendProfile),
          status: ConnectivityStatus.ONLINE
        }
      })
    })

    it('should yield the updates produced by the subscription handler and complete with it', async () => {
      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)

      const result = await generator.next()
      expect(result.value).toEqual({
        friend: parseProfileToFriend(mockFriendProfile),
        status: ConnectivityStatus.ONLINE
      })

      const result2 = await generator.next()
      expect(result2.done).toBe(true)
    })
  })

  describe('when building the initial snapshot', () => {
    let getInitialUpdates: () => Promise<unknown[]>

    beforeEach(async () => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {})

      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
      await generator.next()

      getInitialUpdates = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].getInitialUpdates
    })

    it('should provide a snapshot provider to the subscription handler so the live listener registers first', () => {
      expect(getInitialUpdates).toEqual(expect.any(Function))
    })

    describe('and there are online friends', () => {
      beforeEach(() => {
        mockPeersStats.getConnectedPeers.mockResolvedValueOnce(['0x456', '0x789'])
        mockFriendsDB.getOnlineFriends.mockResolvedValueOnce([friend])
        mockRegistry.getProfiles.mockResolvedValueOnce([mockFriendProfile])
      })

      it('should resolve to the online friends profiles with ONLINE status', async () => {
        await expect(getInitialUpdates()).resolves.toEqual([
          {
            friend: parseProfileToFriend(mockFriendProfile),
            status: ConnectivityStatus.ONLINE
          }
        ])
      })

      it('should query the online friends of the subscriber against the connected peers', async () => {
        await getInitialUpdates()

        expect(mockFriendsDB.getOnlineFriends).toHaveBeenCalledWith('0x123', ['0x456', '0x789'])
      })
    })

    describe('and there are no online friends', () => {
      beforeEach(() => {
        mockPeersStats.getConnectedPeers.mockResolvedValueOnce([])
        mockFriendsDB.getOnlineFriends.mockResolvedValueOnce([])
        mockRegistry.getProfiles.mockResolvedValueOnce([])
      })

      it('should resolve to an empty snapshot', async () => {
        await expect(getInitialUpdates()).resolves.toEqual([])
      })
    })

    describe('and the snapshot queries fail', () => {
      let testError: Error

      beforeEach(() => {
        testError = new Error('Test error')
        mockPeersStats.getConnectedPeers.mockRejectedValueOnce(testError)
      })

      it('should reject so the subscription handler can log it and continue with live updates', async () => {
        await expect(getInitialUpdates()).rejects.toThrow(testError)
      })
    })
  })

  describe('when the live update stream errors', () => {
    let streamError: Error

    beforeEach(() => {
      streamError = new Error('stream boom')
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        throw streamError
      })
    })

    it('should log the error and propagate it', async () => {
      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)

      await expect(generator.next()).rejects.toThrow(streamError)
      expect(logs.getLogger('subscribe-to-friend-connectivity-updates-service').error).toHaveBeenCalledWith(
        'Error in friend connectivity updates subscription:',
        streamError
      )
    })
  })

  describe('when the subscription is cleaned up', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        while (true) {
          yield undefined
        }
      })
    })

    it('should properly clean up subscription on return', async () => {
      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
      const result = await generator.return(undefined)

      expect(result.done).toBe(true)
    })
  })

  describe('when extracting addresses from updates', () => {
    beforeEach(async () => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {})

      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
      await generator.next()
    })

    it('should get the address from the update', () => {
      const getAddressFromUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].getAddressFromUpdate
      const mockUpdate = { address: '0x456', status: ConnectivityStatus.ONLINE }
      expect(getAddressFromUpdate(mockUpdate)).toBe('0x456')
    })
  })

  describe('when filtering connectivity updates', () => {
    let mockUpdateFromOther: any
    let mockUpdateFromSelf: any

    beforeEach(async () => {
      mockUpdateFromOther = {
        address: '0x456', // different from context.address
        status: ConnectivityStatus.ONLINE
      }

      mockUpdateFromSelf = {
        address: '0x123', // same as context.address
        status: ConnectivityStatus.ONLINE
      }

      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {})

      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
      await generator.next()
    })

    it('should filter connectivity updates based on address conditions', () => {
      // Extract the shouldHandleUpdate function from the handler call
      const shouldHandleUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].shouldHandleUpdate

      // Verify filtering logic
      expect(shouldHandleUpdate(mockUpdateFromOther)).toBe(true) // Should handle: from different address
      expect(shouldHandleUpdate(mockUpdateFromSelf)).toBe(false) // Should not handle: from self
    })
  })

  describe('when building the final stream-closed message', () => {
    let streamClosed: SubscriptionStreamClosed

    beforeEach(async () => {
      streamClosed = { reason: SubscriptionStreamClosedReason.STREAM_CLOSED_SERVER_SHUTTING_DOWN }
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {})

      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
      await generator.next()
    })

    it('should build an update with protobuf defaults carrying the stream-closed notice', () => {
      const buildStreamClosedUpdate =
        mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].buildStreamClosedUpdate

      // friend/status are the protobuf zero-value defaults; clients must ignore them when
      // streamClosed is present.
      expect(buildStreamClosedUpdate(streamClosed)).toEqual({
        friend: undefined,
        status: ConnectivityStatus.ONLINE,
        streamClosed
      })
    })
  })
})
