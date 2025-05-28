import { mockCatalystClient, mockFriendsDB, mockLogs } from '../../../../mocks/components'
import { getMutualFriendsService } from '../../../../../src/adapters/rpc-server/services/get-mutual-friends'
import { GetMutualFriendsPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { createMockFriend, parseExpectedFriends } from '../../../../mocks/friend'

describe('getMutualFriendsService', () => {
  let getMutualFriends: ReturnType<typeof getMutualFriendsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  const mutualFriendsRequest: GetMutualFriendsPayload = {
    user: { address: '0x456' },
    pagination: { limit: 10, offset: 0 }
  }

  beforeEach(async () => {
    getMutualFriends = getMutualFriendsService({
      components: { db: mockFriendsDB, logs: mockLogs, catalystClient: mockCatalystClient }
    })
  })

  it('should return the correct list of mutual friends with pagination data', async () => {
    const addresses = ['0x789', '0xabc']
    const mockMutualFriends = addresses.map(createMockFriend)
    const mockMutualFriendsProfiles = addresses.map(createMockProfile)
    const totalMutualFriends = 2

    mockFriendsDB.getMutualFriends.mockResolvedValueOnce(mockMutualFriends)
    mockFriendsDB.getMutualFriendsCount.mockResolvedValueOnce(totalMutualFriends)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockMutualFriendsProfiles)

    const response = await getMutualFriends(mutualFriendsRequest, rpcContext)

    expect(response).toEqual({
      friends: mockMutualFriendsProfiles.map(parseExpectedFriends()),
      paginationData: {
        total: totalMutualFriends,
        page: 1
      }
    })
  })

  it('should return an empty list if no mutual friends are found', async () => {
    mockFriendsDB.getMutualFriends.mockResolvedValueOnce([])
    mockFriendsDB.getMutualFriendsCount.mockResolvedValueOnce(0)

    const response = await getMutualFriends(
      { ...mutualFriendsRequest, pagination: { limit: 10, offset: 0 } },
      rpcContext
    )

    expect(response).toEqual({
      friends: [],
      paginationData: {
        total: 0,
        page: 1
      }
    })
  })

  it('should handle errors from the database gracefully', async () => {
    mockFriendsDB.getMutualFriends.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    const response = await getMutualFriends(mutualFriendsRequest, rpcContext)

    expect(response).toEqual({
      friends: [],
      paginationData: {
        total: 0,
        page: 1
      }
    })
  })

  it('should handle errors from the catalyst gracefully', async () => {
    mockCatalystClient.getProfiles.mockImplementationOnce(() => {
      throw new Error('Catalyst error')
    })

    const response = await getMutualFriends(mutualFriendsRequest, rpcContext)

    expect(response).toEqual({
      friends: [],
      paginationData: {
        total: 0,
        page: 1
      }
    })
  })
})
