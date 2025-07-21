import { mockLogs } from '../../../../mocks/components'
import { getFriendsService } from '../../../../../src/controllers/handlers/rpc/get-friends'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { createMockFriend, parseExpectedFriends } from '../../../../mocks/friend'
import { IFriendsComponent } from '../../../../../src/logic/friends'
import { createFriendsComponent } from '../../../../../src/logic/friends/component'
import { createFriendsDBMockedComponent } from '../../../../mocks/components/friends-db'
import { mockCatalystClient } from '../../../../mocks/components/catalyst-client'

describe('Get Friends Service', () => {
  let getFriends: ReturnType<typeof getFriendsService>
  let friendsComponent: IFriendsComponent
  let mockFriendsDB: jest.Mocked<ReturnType<typeof createFriendsDBMockedComponent>>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(async () => {
    mockFriendsDB = createFriendsDBMockedComponent({})
    friendsComponent = await createFriendsComponent({
      friendsDb: mockFriendsDB,
      catalystClient: mockCatalystClient
    })

    getFriends = getFriendsService({
      components: { friends: friendsComponent, logs: mockLogs }
    })
  })

  describe('when getting friends', () => {
    describe('and the user has friends', () => {
      const addresses = ['0x456', '0x789', '0x987']
      const mockFriends = addresses.map((address) => ({ address }))
      const mockProfiles = addresses.map(createMockProfile)
      const totalFriends = 3

      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(totalFriends)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should return the correct list of friends with pagination data', async () => {
        const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

        expect(response).toEqual({
          friends: mockProfiles.map(parseExpectedFriends()),
          paginationData: {
            total: totalFriends,
            page: 1
          }
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(rpcContext.address, {
          pagination: { limit: 10, offset: 0 },
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(rpcContext.address, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(addresses)
      })

      it('should handle pagination correctly', async () => {
        const response = await getFriends({ pagination: { limit: 5, offset: 10 } }, rpcContext)

        expect(response).toEqual({
          friends: mockProfiles.map(parseExpectedFriends()),
          paginationData: {
            total: totalFriends,
            page: 3 // (10 / 5) + 1 = 3
          }
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(rpcContext.address, {
          pagination: { limit: 5, offset: 10 },
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(rpcContext.address, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(addresses)
      })
    })

    describe('and the user has no friends', () => {
      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue([])
        mockFriendsDB.getFriendsCount.mockResolvedValue(0)
        mockCatalystClient.getProfiles.mockResolvedValue([])
      })

      it('should return an empty list', async () => {
        const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

        expect(response).toEqual({
          friends: [],
          paginationData: {
            total: 0,
            page: 1
          }
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(rpcContext.address, {
          pagination: { limit: 10, offset: 0 },
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(rpcContext.address, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
      })
    })

    describe('and no pagination is provided', () => {
      const addresses = ['0x456']
      const mockFriends = addresses.map((address) => ({ address }))
      const mockProfiles = addresses.map(createMockProfile)
      const totalFriends = 1

      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(totalFriends)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should work without pagination', async () => {
        const response = await getFriends({}, rpcContext)

        expect(response).toEqual({
          friends: mockProfiles.map(parseExpectedFriends()),
          paginationData: {
            total: totalFriends,
            page: 1
          }
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(rpcContext.address, {
          pagination: undefined,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(rpcContext.address, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(addresses)
      })
    })

    describe('and the database returns an error', () => {
      beforeEach(() => {
        mockFriendsDB.getFriends.mockRejectedValue(new Error('Database error'))
      })

      it('should handle errors gracefully', async () => {
        const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

        expect(response).toEqual({
          friends: [],
          paginationData: {
            total: 0,
            page: 1
          }
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(rpcContext.address, {
          pagination: { limit: 10, offset: 0 },
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(rpcContext.address, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('and the catalyst client returns an error', () => {
      const mockFriends = [{ address: '0x456' }]

      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(1)
        mockCatalystClient.getProfiles.mockRejectedValue(new Error('Catalyst error'))
      })

      it('should handle errors gracefully', async () => {
        const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

        expect(response).toEqual({
          friends: [],
          paginationData: {
            total: 0,
            page: 1
          }
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(rpcContext.address, {
          pagination: { limit: 10, offset: 0 },
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(rpcContext.address, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0x456'])
      })
    })
  })
})
