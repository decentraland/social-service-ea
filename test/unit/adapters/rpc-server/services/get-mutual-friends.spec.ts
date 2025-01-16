import { mockDb, mockLogs } from '../../../../mocks/components'
import { getMutualFriendsService } from '../../../../../src/adapters/rpc-server/services/get-mutual-friends'
import { INTERNAL_SERVER_ERROR, FRIENDSHIPS_PER_PAGE } from '../../../../../src/adapters/rpc-server/constants'
import { GetMutualFriendsPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'
import { RpcServerContext, AppComponents } from '../../../../../src/types'

describe('getMutualFriendsService', () => {
  let components: jest.Mocked<Pick<AppComponents, 'db' | 'logs'>>
  let getMutualFriends: ReturnType<typeof getMutualFriendsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribers: undefined
  }

  const mutualFriendsRequest: GetMutualFriendsPayload = {
    user: { address: '0x456' },
    pagination: { limit: 10, offset: 0 }
  }

  beforeEach(() => {
    components = { db: mockDb, logs: mockLogs }
    getMutualFriends = getMutualFriendsService({ components })
  })

  it('should return the correct list of mutual friends with pagination data', async () => {
    const mockMutualFriends = [{ address: '0x789' }, { address: '0xabc' }]
    const totalMutualFriends = 2

    mockDb.getMutualFriends.mockResolvedValueOnce(mockMutualFriends)
    mockDb.getMutualFriendsCount.mockResolvedValueOnce(totalMutualFriends)

    const response = await getMutualFriends(mutualFriendsRequest, rpcContext)

    expect(response).toEqual({
      users: mockMutualFriends,
      paginationData: {
        total: totalMutualFriends,
        page: 1 // First page is 1
      }
    })
  })

  it('should respect the pagination limit', async () => {
    const mockMutualFriends = Array.from({ length: FRIENDSHIPS_PER_PAGE }, (_, i) => ({
      address: `0x${i + 1}`
    }))
    const totalMutualFriends = FRIENDSHIPS_PER_PAGE + 5

    mockDb.getMutualFriends.mockResolvedValueOnce(mockMutualFriends)
    mockDb.getMutualFriendsCount.mockResolvedValueOnce(totalMutualFriends)

    const response = await getMutualFriends(
      { ...mutualFriendsRequest, pagination: { limit: FRIENDSHIPS_PER_PAGE, offset: 0 } },
      rpcContext
    )

    expect(response.users).toHaveLength(FRIENDSHIPS_PER_PAGE)
    expect(response.paginationData).toEqual({
      total: totalMutualFriends,
      page: 1 // First page is 1
    })
  })

  it('should return an empty list if no mutual friends are found', async () => {
    mockDb.getMutualFriends.mockResolvedValueOnce([])
    mockDb.getMutualFriendsCount.mockResolvedValueOnce(0)

    const response = await getMutualFriends(
      { ...mutualFriendsRequest, pagination: { limit: 10, offset: 0 } },
      rpcContext
    )

    expect(response).toEqual({
      users: [],
      paginationData: {
        total: 0,
        page: 1 // First page is 1, even when no results
      }
    })
  })

  it('should handle errors from the database gracefully', async () => {
    mockDb.getMutualFriends.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    await expect(getMutualFriends(mutualFriendsRequest, rpcContext)).rejects.toThrow(INTERNAL_SERVER_ERROR)
  })
})
