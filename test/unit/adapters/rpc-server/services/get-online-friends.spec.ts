import { mockArchipelagoStats, mockCatalystClient, mockDb, mockLogs } from '../../../../mocks/components'
import { getOnlineFriendsService } from '../../../../../src/adapters/rpc-server/services/get-online-friends'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { createMockFriend, parseExpectedFriends } from '../../../../mocks/friend'

describe('getOnlineFriendsService', () => {
  let getOnlineFriends: ReturnType<typeof getOnlineFriendsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(() => {
    getOnlineFriends = getOnlineFriendsService({
      components: {
        db: mockDb,
        logs: mockLogs,
        catalystClient: mockCatalystClient,
        archipelagoStats: mockArchipelagoStats
      }
    })
  })

  it('should return the correct list of online friends', async () => {
    const addresses = ['0x456', '0x789', '0x987']
    const mockFriends = addresses.map(createMockFriend)
    const mockProfiles = addresses.map(createMockProfile)

    mockArchipelagoStats.getPeersFromCache.mockResolvedValueOnce(addresses)
    mockDb.getOnlineFriends.mockResolvedValueOnce(mockFriends)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

    const response = await getOnlineFriends({}, rpcContext)

    expect(response).toEqual({
      friends: mockProfiles.map(parseExpectedFriends())
    })
  })

  it('should return an empty list if there are no online friends', async () => {
    mockArchipelagoStats.getPeersFromCache.mockResolvedValueOnce([])

    const response = await getOnlineFriends({}, rpcContext)

    expect(response).toEqual({
      friends: []
    })
  })

  it('should return an empty list if no friends are found', async () => {
    mockDb.getOnlineFriends.mockResolvedValueOnce([])

    const response = await getOnlineFriends({}, rpcContext)

    expect(response).toEqual({
      friends: []
    })
  })

  it('should handle errors from the database gracefully', async () => {
    mockDb.getOnlineFriends.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    const response = await getOnlineFriends({}, rpcContext)

    expect(response).toEqual({
      friends: []
    })
  })

  it('should handle errors from the catalyst gracefully', async () => {
    mockCatalystClient.getProfiles.mockImplementationOnce(() => {
      throw new Error('Catalyst error')
    })

    const response = await getOnlineFriends({}, rpcContext)

    expect(response).toEqual({
      friends: []
    })
  })

  it('should handle errors from the archipelago stats gracefully', async () => {
    mockArchipelagoStats.getPeersFromCache.mockImplementationOnce(() => {
      throw new Error('Archipelago stats error')
    })

    const response = await getOnlineFriends({}, rpcContext)

    expect(response).toEqual({
      friends: []
    })
  })
})
