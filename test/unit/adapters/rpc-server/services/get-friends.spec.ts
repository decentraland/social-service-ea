import { mockDb, mockLogs } from '../../../../mocks/components'
import { getFriendsService } from '../../../../../src/adapters/rpc-server/services/get-friends'
import { FRIENDSHIPS_COUNT_PAGE_STREAM, INTERNAL_SERVER_ERROR } from '../../../../../src/adapters/rpc-server/constants'
import { RpcServerContext, Friendship, AppComponents } from '../../../../../src/types'
import { emptyRequest } from '../../../../mocks/empty-request'

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

  it('should return the correct list of friends', async () => {
    const mockGetFriendsGenerator = async function* () {
      yield createMockFriendship('0x456', '0x123')
      yield createMockFriendship('0x789', '0x123')
    }
    mockDb.getFriends.mockReturnValueOnce(mockGetFriendsGenerator())

    const generator = getFriends(emptyRequest, rpcContext)

    const result1 = await generator.next()
    expect(result1.value).toEqual({ users: [{ address: '0x456' }, { address: '0x789' }] })

    const result2 = await generator.next()
    expect(result2.done).toBe(true)
  })

  it('should respect the pagination limit', async () => {
    const mockFriendsGenerator = async function* () {
      for (let i = 0; i < FRIENDSHIPS_COUNT_PAGE_STREAM + 1; i++) {
        yield createMockFriendship(`0x${i + 1}`, '0x123')
      }
    }
    mockDb.getFriends.mockReturnValueOnce(mockFriendsGenerator())

    const generator = getFriends(emptyRequest, rpcContext)

    const result1 = await generator.next()
    expect(result1.value.users).toHaveLength(FRIENDSHIPS_COUNT_PAGE_STREAM)

    const result2 = await generator.next()
    expect(result2.value.users).toHaveLength(1)
    expect(result2.done).toBe(false) // Generator still has values
  })

  it('should handle errors from the database gracefully', async () => {
    mockDb.getFriends.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    const generator = getFriends(emptyRequest, rpcContext)

    await expect(generator.next()).rejects.toThrow(INTERNAL_SERVER_ERROR)
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
