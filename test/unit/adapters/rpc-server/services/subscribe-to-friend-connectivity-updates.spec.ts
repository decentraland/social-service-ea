import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext } from '../../../../../src/types'
import {
  mockLogs,
  mockFriendsDB,
  mockCatalystClient,
  createMockPeersStatsComponent,
  createMockUpdateHandlerComponent
} from '../../../../mocks/components'
import { subscribeToFriendConnectivityUpdatesService } from '../../../../../src/controllers/handlers/rpc/subscribe-to-friend-connectivity-updates'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfileToFriend } from '../../../../../src/logic/friends'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'
import { IPeersStatsComponent } from '../../../../../src/logic/peers-stats'

describe('when subscribing to friend connectivity updates', () => {
  let subscribeToFriendConnectivityUpdates: ReturnType<typeof subscribeToFriendConnectivityUpdatesService>
  let rpcContext: RpcServerContext
  let mockUpdateHandler: jest.Mocked<any>
  let mockPeersStats: jest.Mocked<IPeersStatsComponent>
  let subscribersContext: any
  let mockFriendProfile: any

  const friend = {
    address: '0x456'
  }

  beforeEach(() => {
    subscribersContext = createSubscribersContext()
    mockUpdateHandler = createMockUpdateHandlerComponent({})
    mockPeersStats = createMockPeersStatsComponent()
    mockFriendProfile = createMockProfile('0x456')

    subscribeToFriendConnectivityUpdates = subscribeToFriendConnectivityUpdatesService({
      components: {
        logs: mockLogs,
        friendsDb: mockFriendsDB,
        catalystClient: mockCatalystClient,
        peersStats: mockPeersStats,
        updateHandler: mockUpdateHandler
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  describe('when there are online friends', () => {
    beforeEach(() => {
      mockFriendsDB.getOnlineFriends.mockResolvedValueOnce([friend])
      mockCatalystClient.getProfiles.mockResolvedValueOnce([mockFriendProfile])
      mockPeersStats.getConnectedPeers.mockResolvedValueOnce(['0x456', '0x789', '0x654', '0x987'])
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          friend: parseProfileToFriend(mockFriendProfile),
          status: ConnectivityStatus.ONLINE
        }
      })
    })

    it('should get initial online friends and then receive updates', async () => {
      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
      const result = await generator.next()

      expect(mockPeersStats.getConnectedPeers).toHaveBeenCalled()
      expect(result.value).toEqual({
        friend: parseProfileToFriend(mockFriendProfile),
        status: ConnectivityStatus.ONLINE
      })

      const result2 = await generator.next()
      expect(result2.done).toBe(false)
    })
  })

  describe('when there are no online friends', () => {
    beforeEach(() => {
      mockFriendsDB.getOnlineFriends.mockResolvedValueOnce([])
      mockCatalystClient.getProfiles.mockResolvedValueOnce([])
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          friend: parseProfileToFriend(mockFriendProfile),
          status: ConnectivityStatus.ONLINE
        }
      })
    })

    it('should handle empty online friends list and then receive updates', async () => {
      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)

      const result = await generator.next()
      expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
      expect(result.done).toBe(false)

      const result2 = await generator.next()
      expect(result2.done).toBe(true)
    })
  })

  describe('when the subscription encounters an error', () => {
    let testError: Error

    beforeEach(() => {
      testError = new Error('Test error')
      mockFriendsDB.getOnlineFriends.mockRejectedValue(testError)
    })

    it('should propagate the error', async () => {
      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
      await expect(generator.next()).rejects.toThrow(testError)
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
    beforeEach(() => {
      mockFriendsDB.getOnlineFriends.mockResolvedValueOnce([])
      mockCatalystClient.getProfiles.mockResolvedValueOnce([])
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          friend: parseProfileToFriend(mockFriendProfile),
          status: ConnectivityStatus.ONLINE
        }
      })

      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
      generator.next()
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

    beforeEach(() => {
      mockFriendsDB.getOnlineFriends.mockResolvedValueOnce([])
      mockCatalystClient.getProfiles.mockResolvedValueOnce([])
      mockUpdateFromOther = {
        address: '0x456', // different from context.address
        status: ConnectivityStatus.ONLINE
      }

      mockUpdateFromSelf = {
        address: '0x123', // same as context.address
        status: ConnectivityStatus.ONLINE
      }

      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          friend: parseProfileToFriend(mockFriendProfile),
          status: ConnectivityStatus.ONLINE
        }
      })

      const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
      generator.next()
    })

    it('should filter connectivity updates based on address conditions', () => {
      // Extract the shouldHandleUpdate function from the handler call
      const shouldHandleUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].shouldHandleUpdate

      // Verify filtering logic
      expect(shouldHandleUpdate(mockUpdateFromOther)).toBe(true) // Should handle: from different address
      expect(shouldHandleUpdate(mockUpdateFromSelf)).toBe(false) // Should not handle: from self
    })
  })
})
