import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext } from '../../../../../src/types'
import { mockLogs, mockArchipelagoStats, mockDb, mockConfig, mockCatalystClient } from '../../../../mocks/components'
import { subscribeToFriendConnectivityUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-friend-connectivity-updates'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfileToFriend } from '../../../../../src/logic/friends'
import { handleSubscriptionUpdates } from '../../../../../src/logic/updates'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'
import { mockWorldsStats } from '../../../../mocks/components/worlds-stats'

jest.mock('../../../../../src/logic/updates')

describe('subscribeToFriendConnectivityUpdatesService', () => {
  let subscribeToFriendConnectivityUpdates: ReturnType<typeof subscribeToFriendConnectivityUpdatesService>
  let rpcContext: RpcServerContext
  const mockFriendProfile = createMockProfile('0x456')
  const mockHandler = handleSubscriptionUpdates as jest.Mock
  const friend = {
    address: '0x456'
  }
  const subscribersContext = createSubscribersContext()

  beforeEach(async () => {
    subscribeToFriendConnectivityUpdates = subscribeToFriendConnectivityUpdatesService({
      components: {
        logs: mockLogs,
        db: mockDb,
        archipelagoStats: mockArchipelagoStats,
        catalystClient: mockCatalystClient,
        worldsStats: mockWorldsStats
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  it('should get initial online friends from archipelago stats and then receive updates', async () => {
    mockDb.getOnlineFriends.mockResolvedValueOnce([friend])
    mockCatalystClient.getProfiles.mockResolvedValueOnce([mockFriendProfile])
    mockArchipelagoStats.getPeersFromCache.mockResolvedValue(['0x456', '0x789'])
    mockWorldsStats.getPeers.mockResolvedValue(['0x654', '0x987'])
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseProfileToFriend(mockFriendProfile),
        status: ConnectivityStatus.ONLINE
      }
    })

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    expect(mockArchipelagoStats.getPeersFromCache).toHaveBeenCalled()
    expect(mockWorldsStats.getPeers).toHaveBeenCalled()
    expect(result.value).toEqual({
      friend: parseProfileToFriend(mockFriendProfile),
      status: ConnectivityStatus.ONLINE
    })

    const result2 = await generator.next()
    expect(result2.done).toBe(false)
  })

  it('should handle empty online friends list and then receive updates', async () => {
    mockDb.getOnlineFriends.mockResolvedValueOnce([])
    mockCatalystClient.getProfiles.mockResolvedValueOnce([])
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseProfileToFriend(mockFriendProfile),
        status: ConnectivityStatus.ONLINE
      }
    })

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)

    const result = await generator.next()
    expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
    expect(result.done).toBe(false)

    const result2 = await generator.next()
    expect(result2.done).toBe(true)
  })

  it('should handle errors from archipelago stats', async () => {
    mockDb.getOnlineFriends.mockResolvedValueOnce([friend])
    mockCatalystClient.getProfiles.mockResolvedValueOnce([mockFriendProfile])
    mockArchipelagoStats.getPeersFromCache.mockRejectedValueOnce(new Error('Archipelago error'))
    mockWorldsStats.getPeers.mockResolvedValue(['0x456'])
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseProfileToFriend(mockFriendProfile),
        status: ConnectivityStatus.ONLINE
      }
    })

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)

    const result = await generator.next()
    expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([friend.address])
    expect(result.done).toBe(false)

    const result2 = await generator.next()
    expect(result2.done).toBe(false)
  })

  it('should handle errors from worlds stats', async () => {
    mockDb.getOnlineFriends.mockResolvedValueOnce([friend])
    mockCatalystClient.getProfiles.mockResolvedValueOnce([mockFriendProfile])
    mockArchipelagoStats.getPeersFromCache.mockResolvedValueOnce(['0x456'])
    mockWorldsStats.getPeers.mockRejectedValueOnce(new Error('Worlds error'))
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseProfileToFriend(mockFriendProfile),
        status: ConnectivityStatus.ONLINE
      }
    })

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)

    const result = await generator.next()
    expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([friend.address])
    expect(result.done).toBe(false)

    const result2 = await generator.next()
    expect(result2.done).toBe(false)
  })

  it('should handle errors during subscription', async () => {
    const testError = new Error('Test error')
    mockDb.getOnlineFriends.mockRejectedValue(testError)

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)

    await expect(generator.next()).rejects.toThrow(testError)
  })

  it('should properly clean up subscription on return', async () => {
    mockHandler.mockImplementationOnce(async function* () {
      while (true) {
        yield undefined
      }
    })

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
    const result = await generator.return(undefined)

    expect(result.done).toBe(true)
  })

  it('should get the address from the update', async () => {
    mockDb.getOnlineFriends.mockResolvedValueOnce([])
    mockCatalystClient.getProfiles.mockResolvedValueOnce([])
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseProfileToFriend(mockFriendProfile),
        status: ConnectivityStatus.ONLINE
      }
    })

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
    await generator.next()

    const getAddressFromUpdate = mockHandler.mock.calls[0][0].getAddressFromUpdate
    const mockUpdate = { address: '0x456', status: ConnectivityStatus.ONLINE }
    expect(getAddressFromUpdate(mockUpdate)).toBe('0x456')
  })

  it('should filter connectivity updates based on address conditions', async () => {
    mockDb.getOnlineFriends.mockResolvedValueOnce([])
    mockCatalystClient.getProfiles.mockResolvedValueOnce([])
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseProfileToFriend(mockFriendProfile),
        status: ConnectivityStatus.ONLINE
      }
    })

    const mockUpdateFromOther = {
      address: '0x456', // different from context.address
      status: ConnectivityStatus.ONLINE
    }

    const mockUpdateFromSelf = {
      address: '0x123', // same as context.address
      status: ConnectivityStatus.ONLINE
    }

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
    await generator.next()

    // Extract the shouldHandleUpdate function from the handler call
    const shouldHandleUpdate = mockHandler.mock.calls[0][0].shouldHandleUpdate

    // Verify filtering logic
    expect(shouldHandleUpdate(mockUpdateFromOther)).toBe(true) // Should handle: from different address
    expect(shouldHandleUpdate(mockUpdateFromSelf)).toBe(false) // Should not handle: from self
  })
})
