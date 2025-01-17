import { mockDb, mockLogs } from '../../../../mocks/components'
import { getFriendsService } from '../../../../../src/adapters/rpc-server/services/get-friends'
import { FRIENDSHIPS_PER_PAGE, INTERNAL_SERVER_ERROR } from '../../../../../src/adapters/rpc-server/constants'
import { RpcServerContext, Friendship, AppComponents } from '../../../../../src/types'

describe('getFriendsService', () => {
  let components: jest.Mocked<Pick<AppComponents, 'db' | 'logs'>>
  let getFriends: ReturnType<typeof getFriendsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribers: undefined
  }

  beforeEach(() => {
    components = { db: mockDb, logs: mockLogs }
    getFriends = getFriendsService({ components })
  })

  it('should return the correct list of friends with pagination data', async () => {
    const mockFriends = [
      createMockFriendship('0x123', '0x456'),
      createMockFriendship('0x123', '0x789'),

      createMockFriendship('0x987', '0x123')
    ]
    const totalFriends = 2

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(totalFriends)

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
    const mockFriends = Array.from({ length: FRIENDSHIPS_PER_PAGE }, (_, i) =>
      createMockFriendship(`0x${i + 1}`, '0x123')
    )
    const totalFriends = FRIENDSHIPS_PER_PAGE + 5

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(totalFriends)

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

  // Helper to create a mock friendship object
  const createMockFriendship = (requester: string, requested: string): Friendship => ({
    address_requester: requester,
    address_requested: requested,
    id: 'mock-friendship-id',
    is_active: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
})
