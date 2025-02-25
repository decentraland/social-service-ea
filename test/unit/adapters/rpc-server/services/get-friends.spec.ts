import { mockCatalystClient, mockDb, mockLogs } from '../../../../mocks/components'
import { getFriendsService } from '../../../../../src/adapters/rpc-server/services/get-friends'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { createMockFriend, parseExpectedFriends } from '../../../../mocks/friend'

describe('getFriendsService', () => {
  let getFriends: ReturnType<typeof getFriendsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(() => {
    getFriends = getFriendsService({
      components: { db: mockDb, logs: mockLogs, catalystClient: mockCatalystClient }
    })
  })

  it('should return the correct list of friends with pagination data', async () => {
    const addresses = ['0x456', '0x789', '0x987']
    const mockFriends = addresses.map(createMockFriend)
    const mockProfiles = addresses.map(createMockProfile)
    const totalFriends = 2

    mockDb.getFriends.mockResolvedValueOnce(mockFriends)
    mockDb.getFriendsCount.mockResolvedValueOnce(totalFriends)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

    const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

    expect(response).toEqual({
      friends: mockProfiles.map(parseExpectedFriends()),
      paginationData: {
        total: totalFriends,
        page: 1
      }
    })
  })

  it('should return an empty list if no friends are found', async () => {
    mockDb.getFriends.mockResolvedValueOnce([])
    mockDb.getFriendsCount.mockResolvedValueOnce(0)

    const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

    expect(response).toEqual({
      friends: [],
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

    const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

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

    const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

    expect(response).toEqual({
      friends: [],
      paginationData: {
        total: 0,
        page: 1
      }
    })
  })
})
