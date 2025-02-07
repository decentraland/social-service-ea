import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext } from '../../../../../src/types'
import { mockLogs, mockArchipelagoStats, mockDb, mockConfig, mockCatalystClient } from '../../../../mocks/components'
import { subscribeToFriendConnectivityUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-friend-connectivity-updates'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createMockProfile, PROFILE_IMAGES_URL } from '../../../../mocks/profile'
import { parseProfileToFriend } from '../../../../../src/logic/friends'
import { handleSubscriptionUpdates } from '../../../../../src/logic/updates'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'

jest.mock('../../../../../src/logic/updates')

describe('subscribeToFriendConnectivityUpdatesService', () => {
  let subscribeToFriendConnectivityUpdates: Awaited<ReturnType<typeof subscribeToFriendConnectivityUpdatesService>>
  let rpcContext: RpcServerContext
  const mockFriendProfile = createMockProfile('0x456')
  const mockHandler = handleSubscriptionUpdates as jest.Mock
  const friend = {
    address: '0x456'
  }
  const subscribersContext = createSubscribersContext()

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(PROFILE_IMAGES_URL)

    subscribeToFriendConnectivityUpdates = await subscribeToFriendConnectivityUpdatesService({
      components: {
        logs: mockLogs,
        db: mockDb,
        archipelagoStats: mockArchipelagoStats,
        config: mockConfig,
        catalystClient: mockCatalystClient
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  it('should get initial online friends from archipelago stats and then receive updates', async () => {
    mockDb.getOnlineFriends.mockResolvedValueOnce([friend])
    mockCatalystClient.getEntitiesByPointers.mockResolvedValueOnce([mockFriendProfile])
    mockArchipelagoStats.getPeers.mockResolvedValue(['0x456', '0x789'])
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseProfileToFriend(mockFriendProfile, PROFILE_IMAGES_URL),
        status: ConnectivityStatus.ONLINE
      }
    })

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    expect(mockArchipelagoStats.getPeersFromCache).toHaveBeenCalled()
    expect(result.value).toEqual({
      friend: parseProfileToFriend(mockFriendProfile, PROFILE_IMAGES_URL),
      status: ConnectivityStatus.ONLINE
    })

    const result2 = await generator.next()
    expect(result2.done).toBe(false)
  })

  it('should handle empty online friends list and then receive updates', async () => {
    mockDb.getOnlineFriends.mockResolvedValueOnce([])
    mockCatalystClient.getEntitiesByPointers.mockResolvedValueOnce([])
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseProfileToFriend(mockFriendProfile, PROFILE_IMAGES_URL),
        status: ConnectivityStatus.ONLINE
      }
    })

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)

    const result = await generator.next()
    expect(mockCatalystClient.getEntitiesByPointers).toHaveBeenCalledWith([])
    expect(result.done).toBe(false)

    const result2 = await generator.next()
    expect(result2.done).toBe(true)
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
})
