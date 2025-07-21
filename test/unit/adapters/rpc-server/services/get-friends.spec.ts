import { mockLogs, createFriendsMockedComponent } from '../../../../mocks/components'
import { getFriendsService } from '../../../../../src/controllers/handlers/rpc/get-friends'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { createMockFriend, parseExpectedFriends } from '../../../../mocks/friend'
import { IFriendsComponent } from '../../../../../src/logic/friends'

describe('getFriendsService', () => {
  let getFriends: ReturnType<typeof getFriendsService>
  let friends: jest.Mocked<IFriendsComponent>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(() => {
    friends = createFriendsMockedComponent()
    getFriends = getFriendsService({
      components: { friends, logs: mockLogs }
    })
  })

  it('should return the correct list of friends with pagination data', async () => {
    const addresses = ['0x456', '0x789', '0x987']
    const mockFriends = addresses.map(createMockFriend)
    const mockProfiles = addresses.map(createMockProfile)
    const totalFriends = 2

    friends.getFriendsProfiles.mockResolvedValueOnce({ friendsProfiles: mockProfiles, total: totalFriends })

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
    friends.getFriendsProfiles.mockResolvedValueOnce({ friendsProfiles: [], total: 0 })

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
    friends.getFriendsProfiles.mockImplementationOnce(() => {
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
    friends.getFriendsProfiles.mockImplementationOnce(() => {
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
