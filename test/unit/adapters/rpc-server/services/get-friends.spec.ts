import { mockDb, mockLogs, mockRedis } from '../../../../mocks/components'
import { getFriendsService } from '../../../../../src/adapters/rpc-server/services/get-friends'
import { FRIENDSHIPS_PER_PAGE, INTERNAL_SERVER_ERROR } from '../../../../../src/adapters/rpc-server/constants'
import { RpcServerContext, Friendship, AppComponents, Friend } from '../../../../../src/types'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v3/social_service_v3.gen'
import { PEERS_CACHE_KEY } from '../../../../../src/utils/peers'

describe('getFriendsService', () => {
  let components: jest.Mocked<Pick<AppComponents, 'db' | 'logs' | 'redis'>>
  let getFriends: ReturnType<typeof getFriendsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribers: undefined
  }

  beforeEach(() => {
    components = { db: mockDb, logs: mockLogs, redis: mockRedis }
    getFriends = getFriendsService({ components })
  })

  it('should return the correct list of friends with pagination data', async () => {
    const mockFriends = [createMockFriend('0x456'), createMockFriend('0x789'), createMockFriend('0x987')]
    const totalFriends = 2

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(totalFriends)
    mockRedis.get.mockResolvedValueOnce({})

    const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

    expect(response).toEqual({
      users: [{ address: '0x456' }, { address: '0x789' }, { address: '0x987' }],
      paginationData: {
        total: totalFriends,
        page: 1
      }
    })
  })

  it('should respect the pagination limit', async () => {
    const mockFriends = Array.from({ length: FRIENDSHIPS_PER_PAGE }, (_, i) => createMockFriend(`0x${i + 1}`))
    const totalFriends = FRIENDSHIPS_PER_PAGE + 5

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(totalFriends)
    mockRedis.get.mockResolvedValueOnce({})

    const response = await getFriends({ pagination: { limit: FRIENDSHIPS_PER_PAGE, offset: 0 } }, rpcContext)

    expect(response.users).toHaveLength(FRIENDSHIPS_PER_PAGE)
    expect(response.paginationData).toEqual({
      total: totalFriends,
      page: 1
    })
  })

  it('should return an empty list if no friends are found', async () => {
    mockDb.getFriends.mockResolvedValueOnce([])
    mockDb.getFriendsCount.mockResolvedValueOnce(0)

    const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

    expect(response).toEqual({
      users: [],
      paginationData: {
        total: 0,
        page: 1
      }
    })
  })

  it('should handle errors from the database gracefully', async () => {
    mockDb.getFriends.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    await expect(getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)).rejects.toThrow(
      INTERNAL_SERVER_ERROR
    )
  })

  it('should filter online friends correctly', async () => {
    const mockFriends = [createMockFriend('0x456'), createMockFriend('0x789')]

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(2)
    mockRedis.get.mockResolvedValueOnce({ '0x456': true })

    const response = await getFriends(
      { pagination: { limit: 10, offset: 0 }, status: ConnectivityStatus.ONLINE },
      rpcContext
    )

    expect(response.users).toHaveLength(1)
    expect(response.users[0].address).toBe('0x456')
  })

  it('should filter offline friends correctly', async () => {
    const mockFriends = [createMockFriend('0x456'), createMockFriend('0x789')]

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(2)
    mockRedis.get.mockResolvedValueOnce({ '0x456': true })

    const response = await getFriends(
      { pagination: { limit: 10, offset: 0 }, status: ConnectivityStatus.OFFLINE },
      rpcContext
    )

    expect(response.users).toHaveLength(1)
    expect(response.users[0].address).toBe('0x789')
  })

  it('should return all friends when no status is specified', async () => {
    const mockFriends = [createMockFriend('0x456'), createMockFriend('0x789')]

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(2)
    mockRedis.get.mockResolvedValueOnce({ '0x456': true })

    const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

    expect(response.users).toHaveLength(2)
  })

  it('should handle Redis errors gracefully when filtering by status', async () => {
    const mockFriends = [createMockFriend('0x456'), createMockFriend('0x789')]

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(2)
    mockRedis.get.mockRejectedValueOnce(new Error('Redis error'))

    const response = await getFriends(
      { pagination: { limit: 10, offset: 0 }, status: ConnectivityStatus.ONLINE },
      rpcContext
    )

    expect(response.users).toHaveLength(0)
    expect(components.logs.getLogger('get-friends-service').error).toHaveBeenCalled()
  })

  it('should handle empty Redis response gracefully', async () => {
    const mockFriends = [createMockFriend('0x456'), createMockFriend('0x789')]

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(2)
    mockRedis.get.mockResolvedValueOnce(null)

    const response = await getFriends(
      { pagination: { limit: 10, offset: 0 }, status: ConnectivityStatus.ONLINE },
      rpcContext
    )

    expect(response.users).toHaveLength(0)
  })

  // Helper to create a mock friendship object
  const createMockFriend = (address: string): Friend => ({
    address
  })
})
