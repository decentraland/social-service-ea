import { PoolClient } from 'pg'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createFriendsComponent } from '../../../src/logic/friends/component'
import { IFriendsComponent } from '../../../src/logic/friends/types'
import { createFriendsDBMockedComponent } from '../../mocks/components/friends-db'
import { mockCatalystClient } from '../../mocks/components/catalyst-client'
import { createMockProfile } from '../../mocks/profile'
import { createMockedPubSubComponent } from '../../mocks/components'
import { EthAddress } from '@dcl/schemas'
import { Action, Friendship, User, BlockedUserWithDate, FriendshipRequest, FriendshipAction } from '../../../src/types'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'

describe('Friends Component', () => {
  let friendsComponent: IFriendsComponent
  let mockFriendsDB: jest.Mocked<ReturnType<typeof createFriendsDBMockedComponent>>
  let mockPubSub: jest.Mocked<ReturnType<typeof createMockedPubSubComponent>>
  let mockPublishInChannel: jest.MockedFunction<typeof mockPubSub.publishInChannel>
  let mockUserAddress: string

  beforeEach(async () => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockFriendsDB = createFriendsDBMockedComponent({})
    mockPublishInChannel = jest.fn()
    mockPubSub = createMockedPubSubComponent({
      publishInChannel: mockPublishInChannel
    })

    friendsComponent = await createFriendsComponent({
      friendsDb: mockFriendsDB,
      catalystClient: mockCatalystClient,
      pubsub: mockPubSub
    })
  })

  describe('when getting friends profiles', () => {
    let pagination: Pagination

    beforeEach(() => {
      pagination = { limit: 10, offset: 0 }
    })

    describe('and the user has friends', () => {
      let mockFriends: User[]
      let mockProfiles: Profile[]

      beforeEach(() => {
        mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]
        mockProfiles = [createMockProfile('0xfriend1'), createMockProfile('0xfriend2'), createMockProfile('0xfriend3')]

        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(3)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should return friends profiles with total count', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 3
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1', '0xfriend2', '0xfriend3'])
      })

      it('should handle pagination correctly', async () => {
        const customPagination: Pagination = { limit: 5, offset: 10 }

        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, customPagination)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 3
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination: customPagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
      })
    })

    describe('and the user has no friends', () => {
      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue([])
        mockFriendsDB.getFriendsCount.mockResolvedValue(0)
        mockCatalystClient.getProfiles.mockResolvedValue([])
      })

      it('should return empty profiles array with zero total', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: [],
          total: 0
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
      })
    })

    describe('and no pagination is provided', () => {
      let mockFriends: User[]
      let mockProfiles: Profile[]

      beforeEach(() => {
        mockFriends = [{ address: '0xfriend1' }]
        mockProfiles = [createMockProfile('0xfriend1')]

        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(1)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should work without pagination', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 1
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination: undefined,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1'])
      })
    })

    describe('and there are duplicate friend addresses', () => {
      let mockProfiles: Profile[]

      beforeEach(() => {
        const friendsWithDuplicates: User[] = [
          { address: '0xfriend1' },
          { address: '0xfriend1' }, // Duplicate
          { address: '0xfriend2' }
        ]
        mockProfiles = [createMockProfile('0xfriend1'), createMockProfile('0xfriend2')]

        mockFriendsDB.getFriends.mockResolvedValue(friendsWithDuplicates)
        mockFriendsDB.getFriendsCount.mockResolvedValue(3)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should handle duplicate addresses correctly', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 3
        })

        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([
          '0xfriend1',
          '0xfriend1', // Duplicate should be included as it comes from the database
          '0xfriend2'
        ])
      })
    })

    describe('and the database returns an error', () => {
      beforeEach(() => {
        mockFriendsDB.getFriends.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getFriendsProfiles(mockUserAddress, pagination)).rejects.toThrow(
          'Database connection failed'
        )

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('and the catalyst client returns an error', () => {
      let mockFriends: User[]

      beforeEach(() => {
        mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]

        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(3)
        mockCatalystClient.getProfiles.mockRejectedValue(new Error('Catalyst service unavailable'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getFriendsProfiles(mockUserAddress, pagination)).rejects.toThrow(
          'Catalyst service unavailable'
        )

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1', '0xfriend2', '0xfriend3'])
      })
    })

    describe('and the friends count query returns an error', () => {
      let mockFriends: User[]

      beforeEach(() => {
        mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]

        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockRejectedValue(new Error('Count query failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getFriendsProfiles(mockUserAddress, pagination)).rejects.toThrow(
          'Count query failed'
        )

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('and the catalyst client returns fewer profiles than expected', () => {
      let mockFriends: User[]

      beforeEach(() => {
        mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]

        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(3)
        // Catalyst returns only 2 profiles instead of 3
        mockCatalystClient.getProfiles.mockResolvedValue([
          createMockProfile('0xfriend1'),
          createMockProfile('0xfriend2')
        ])
      })

      it('should return the profiles that were successfully retrieved', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: [createMockProfile('0xfriend1'), createMockProfile('0xfriend2')],
          total: 3
        })

        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1', '0xfriend2', '0xfriend3'])
      })
    })

    describe('and the catalyst client returns more profiles than expected', () => {
      let mockFriends: User[]

      beforeEach(() => {
        mockFriends = [{ address: '0xfriend1' }]

        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(1)
        // Catalyst returns 2 profiles instead of 1
        mockCatalystClient.getProfiles.mockResolvedValue([
          createMockProfile('0xfriend1'),
          createMockProfile('0xfriend2')
        ])
      })

      it('should return all profiles from catalyst', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: [createMockProfile('0xfriend1'), createMockProfile('0xfriend2')],
          total: 1
        })

        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1'])
      })
    })
  })

  describe('when getting blocked users', () => {
    describe('and the user has blocked users', () => {
      let mockBlockedUsers: BlockedUserWithDate[]
      let mockProfiles: Profile[]

      beforeEach(() => {
        mockBlockedUsers = [
          { address: '0xblocked1', blocked_at: new Date('2023-01-01') },
          { address: '0xblocked2', blocked_at: new Date('2023-01-02') },
          { address: '0xblocked3', blocked_at: new Date('2023-01-03') }
        ]
        mockProfiles = [
          createMockProfile('0xblocked1'),
          createMockProfile('0xblocked2'),
          createMockProfile('0xblocked3')
        ]

        mockFriendsDB.getBlockedUsers.mockResolvedValue(mockBlockedUsers)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should return blocked users with profiles and total count', async () => {
        const result = await friendsComponent.getBlockedUsers(mockUserAddress)

        expect(result).toEqual({
          blockedUsers: mockBlockedUsers,
          blockedProfiles: mockProfiles,
          total: 3
        })

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xblocked1', '0xblocked2', '0xblocked3'])
      })
    })

    describe('and the user has no blocked users', () => {
      beforeEach(() => {
        mockFriendsDB.getBlockedUsers.mockResolvedValue([])
        mockCatalystClient.getProfiles.mockResolvedValue([])
      })

      it('should return empty arrays with zero total', async () => {
        const result = await friendsComponent.getBlockedUsers(mockUserAddress)

        expect(result).toEqual({
          blockedUsers: [],
          blockedProfiles: [],
          total: 0
        })

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
      })
    })

    describe('and the database returns an error', () => {
      beforeEach(() => {
        mockFriendsDB.getBlockedUsers.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getBlockedUsers(mockUserAddress)).rejects.toThrow('Database connection failed')

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('and the catalyst client returns an error', () => {
      let mockBlockedUsers: BlockedUserWithDate[]

      beforeEach(() => {
        mockBlockedUsers = [
          { address: '0xblocked1', blocked_at: new Date('2023-01-01') },
          { address: '0xblocked2', blocked_at: new Date('2023-01-02') }
        ]

        mockFriendsDB.getBlockedUsers.mockResolvedValue(mockBlockedUsers)
        mockCatalystClient.getProfiles.mockRejectedValue(new Error('Catalyst service unavailable'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getBlockedUsers(mockUserAddress)).rejects.toThrow('Catalyst service unavailable')

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xblocked1', '0xblocked2'])
      })
    })

    describe('and the catalyst client returns fewer profiles than expected', () => {
      let mockBlockedUsers: BlockedUserWithDate[]

      beforeEach(() => {
        mockBlockedUsers = [
          { address: '0xblocked1', blocked_at: new Date('2023-01-01') },
          { address: '0xblocked2', blocked_at: new Date('2023-01-02') },
          { address: '0xblocked3', blocked_at: new Date('2023-01-03') }
        ]

        mockFriendsDB.getBlockedUsers.mockResolvedValue(mockBlockedUsers)
        // Catalyst returns only 2 profiles instead of 3
        mockCatalystClient.getProfiles.mockResolvedValue([
          createMockProfile('0xblocked1'),
          createMockProfile('0xblocked2')
        ])
      })

      it('should return the profiles that were successfully retrieved', async () => {
        const result = await friendsComponent.getBlockedUsers(mockUserAddress)

        expect(result).toEqual({
          blockedUsers: mockBlockedUsers,
          blockedProfiles: [createMockProfile('0xblocked1'), createMockProfile('0xblocked2')],
          total: 3
        })

        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xblocked1', '0xblocked2', '0xblocked3'])
      })
    })
  })

  describe('when getting friendship status', () => {
    describe('and there is a friendship action', () => {
      let mockFriendshipAction: FriendshipAction

      beforeEach(() => {
        mockFriendshipAction = {
          id: 'action-id',
          friendship_id: 'friendship-id',
          acting_user: '0x123',
          action: Action.REQUEST,
          timestamp: new Date().toISOString()
        }

        mockFriendsDB.getLastFriendshipActionByUsers.mockResolvedValue(mockFriendshipAction)
      })

      it('should return the friendship status for the latest action', async () => {
        const result = await friendsComponent.getFriendshipStatus('0x123', '0x456')

        expect(result).toBeDefined()
        expect(mockFriendsDB.getLastFriendshipActionByUsers).toHaveBeenCalledWith('0x123', '0x456')
      })
    })

    describe('and there is no friendship action', () => {
      beforeEach(() => {
        mockFriendsDB.getLastFriendshipActionByUsers.mockResolvedValue(null)
      })

      it('should return NONE status', async () => {
        const result = await friendsComponent.getFriendshipStatus('0x123', '0x456')

        expect(result).toBeDefined()
        expect(mockFriendsDB.getLastFriendshipActionByUsers).toHaveBeenCalledWith('0x123', '0x456')
      })
    })

    describe('and the database returns an error', () => {
      beforeEach(() => {
        mockFriendsDB.getLastFriendshipActionByUsers.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getFriendshipStatus('0x123', '0x456')).rejects.toThrow(
          'Database connection failed'
        )

        expect(mockFriendsDB.getLastFriendshipActionByUsers).toHaveBeenCalledWith('0x123', '0x456')
      })
    })
  })

  describe('when getting mutual friends', () => {
    let pagination: Pagination
    let requesterAddress: string
    let requestedAddress: string

    beforeEach(() => {
      pagination = { limit: 10, offset: 0 }
      requesterAddress = '0x123'
      requestedAddress = '0x456'
    })

    describe('and there are mutual friends', () => {
      let mockMutualFriends: User[]
      let mockProfiles: Profile[]

      beforeEach(() => {
        mockMutualFriends = [{ address: '0xmutual1' }, { address: '0xmutual2' }, { address: '0xmutual3' }]
        mockProfiles = [createMockProfile('0xmutual1'), createMockProfile('0xmutual2'), createMockProfile('0xmutual3')]

        mockFriendsDB.getMutualFriends.mockResolvedValue(mockMutualFriends)
        mockFriendsDB.getMutualFriendsCount.mockResolvedValue(3)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should return mutual friends profiles with total count', async () => {
        const result = await friendsComponent.getMutualFriendsProfiles(requesterAddress, requestedAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 3
        })

        expect(mockFriendsDB.getMutualFriends).toHaveBeenCalledWith(requesterAddress, requestedAddress, pagination)
        expect(mockFriendsDB.getMutualFriendsCount).toHaveBeenCalledWith(requesterAddress, requestedAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xmutual1', '0xmutual2', '0xmutual3'])
      })
    })

    describe('and there are no mutual friends', () => {
      beforeEach(() => {
        mockFriendsDB.getMutualFriends.mockResolvedValue([])
        mockFriendsDB.getMutualFriendsCount.mockResolvedValue(0)
        mockCatalystClient.getProfiles.mockResolvedValue([])
      })

      it('should return empty profiles array with zero total', async () => {
        const result = await friendsComponent.getMutualFriendsProfiles(requesterAddress, requestedAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: [],
          total: 0
        })

        expect(mockFriendsDB.getMutualFriends).toHaveBeenCalledWith(requesterAddress, requestedAddress, pagination)
        expect(mockFriendsDB.getMutualFriendsCount).toHaveBeenCalledWith(requesterAddress, requestedAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
      })
    })

    describe('and no pagination is provided', () => {
      let mockMutualFriends: User[]
      let mockProfiles: Profile[]

      beforeEach(() => {
        mockMutualFriends = [{ address: '0xmutual1' }]
        mockProfiles = [createMockProfile('0xmutual1')]

        mockFriendsDB.getMutualFriends.mockResolvedValue(mockMutualFriends)
        mockFriendsDB.getMutualFriendsCount.mockResolvedValue(1)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should work without pagination', async () => {
        const result = await friendsComponent.getMutualFriendsProfiles(requesterAddress, requestedAddress)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 1
        })

        expect(mockFriendsDB.getMutualFriends).toHaveBeenCalledWith(requesterAddress, requestedAddress, undefined)
        expect(mockFriendsDB.getMutualFriendsCount).toHaveBeenCalledWith(requesterAddress, requestedAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xmutual1'])
      })
    })

    describe('and the getMutualFriends database call fails', () => {
      beforeEach(() => {
        mockFriendsDB.getMutualFriends.mockRejectedValue(new Error('Database connection failed'))
        mockFriendsDB.getMutualFriendsCount.mockResolvedValue(0)
      })

      it('should propagate the error', async () => {
        await expect(
          friendsComponent.getMutualFriendsProfiles(requesterAddress, requestedAddress, pagination)
        ).rejects.toThrow('Database connection failed')

        expect(mockFriendsDB.getMutualFriends).toHaveBeenCalledWith(requesterAddress, requestedAddress, pagination)
        expect(mockFriendsDB.getMutualFriendsCount).toHaveBeenCalledWith(requesterAddress, requestedAddress)
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('and the getMutualFriendsCount database call fails', () => {
      let mockMutualFriends: User[]

      beforeEach(() => {
        mockMutualFriends = [{ address: '0xmutual1' }]

        mockFriendsDB.getMutualFriends.mockResolvedValue(mockMutualFriends)
        mockFriendsDB.getMutualFriendsCount.mockRejectedValue(new Error('Count query failed'))
      })

      it('should propagate the error', async () => {
        await expect(
          friendsComponent.getMutualFriendsProfiles(requesterAddress, requestedAddress, pagination)
        ).rejects.toThrow('Count query failed')

        expect(mockFriendsDB.getMutualFriends).toHaveBeenCalledWith(requesterAddress, requestedAddress, pagination)
        expect(mockFriendsDB.getMutualFriendsCount).toHaveBeenCalledWith(requesterAddress, requestedAddress)
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('and the catalyst client returns an error', () => {
      let mockMutualFriends: User[]

      beforeEach(() => {
        mockMutualFriends = [{ address: '0xmutual1' }, { address: '0xmutual2' }]

        mockFriendsDB.getMutualFriends.mockResolvedValue(mockMutualFriends)
        mockFriendsDB.getMutualFriendsCount.mockResolvedValue(2)
        mockCatalystClient.getProfiles.mockRejectedValue(new Error('Catalyst service unavailable'))
      })

      it('should propagate the error', async () => {
        await expect(
          friendsComponent.getMutualFriendsProfiles(requesterAddress, requestedAddress, pagination)
        ).rejects.toThrow('Catalyst service unavailable')

        expect(mockFriendsDB.getMutualFriends).toHaveBeenCalledWith(requesterAddress, requestedAddress, pagination)
        expect(mockFriendsDB.getMutualFriendsCount).toHaveBeenCalledWith(requesterAddress, requestedAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xmutual1', '0xmutual2'])
      })
    })
  })

  describe('when getting pending friendship requests', () => {
    let pagination: Pagination
    let userAddress: string

    beforeEach(() => {
      pagination = { limit: 10, offset: 0 }
      userAddress = '0x1234567890123456789012345678901234567890'
    })

    describe('and there are pending requests', () => {
      let mockPendingRequests: FriendshipRequest[]
      let mockProfiles: Profile[]

      beforeEach(() => {
        mockPendingRequests = [
          { id: 'req1', address: '0xrequester1', timestamp: new Date().toISOString(), metadata: { message: 'Hello' } },
          {
            id: 'req2',
            address: '0xrequester2',
            timestamp: new Date().toISOString(),
            metadata: { message: 'Hi there' }
          }
        ]
        mockProfiles = [createMockProfile('0xrequester1'), createMockProfile('0xrequester2')]

        mockFriendsDB.getReceivedFriendshipRequests.mockResolvedValue(mockPendingRequests)
        mockFriendsDB.getReceivedFriendshipRequestsCount.mockResolvedValue(2)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should return pending requests with total count', async () => {
        const result = await friendsComponent.getPendingFriendshipRequests(userAddress, pagination)

        expect(result).toEqual({
          requests: expect.any(Array),
          profiles: expect.any(Array),
          total: 2
        })

        expect(mockFriendsDB.getReceivedFriendshipRequests).toHaveBeenCalledWith(userAddress, pagination)
        expect(mockFriendsDB.getReceivedFriendshipRequestsCount).toHaveBeenCalledWith(userAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xrequester1', '0xrequester2'])
      })
    })

    describe('and there are no pending requests', () => {
      beforeEach(() => {
        mockFriendsDB.getReceivedFriendshipRequests.mockResolvedValue([])
        mockFriendsDB.getReceivedFriendshipRequestsCount.mockResolvedValue(0)
        mockCatalystClient.getProfiles.mockResolvedValue([])
      })

      it('should return empty requests array with zero total', async () => {
        const result = await friendsComponent.getPendingFriendshipRequests(userAddress, pagination)

        expect(result).toEqual({
          requests: [],
          profiles: [],
          total: 0
        })

        expect(mockFriendsDB.getReceivedFriendshipRequests).toHaveBeenCalledWith(userAddress, pagination)
        expect(mockFriendsDB.getReceivedFriendshipRequestsCount).toHaveBeenCalledWith(userAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
      })
    })

    describe('and the database returns an error', () => {
      beforeEach(() => {
        mockFriendsDB.getReceivedFriendshipRequests.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getPendingFriendshipRequests(userAddress, pagination)).rejects.toThrow(
          'Database connection failed'
        )

        expect(mockFriendsDB.getReceivedFriendshipRequests).toHaveBeenCalledWith(userAddress, pagination)
        expect(mockFriendsDB.getReceivedFriendshipRequestsCount).toHaveBeenCalledWith(userAddress)
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })
  })

  describe('when getting sent friendship requests', () => {
    let pagination: Pagination
    let userAddress: string

    beforeEach(() => {
      pagination = { limit: 10, offset: 0 }
      userAddress = '0x1234567890123456789012345678901234567890'
    })

    describe('and there are sent requests', () => {
      let mockSentRequests: FriendshipRequest[]
      let mockProfiles: Profile[]

      beforeEach(() => {
        mockSentRequests = [
          { id: 'req1', address: '0xrequested1', timestamp: new Date().toISOString(), metadata: { message: 'Hello' } },
          {
            id: 'req2',
            address: '0xrequested2',
            timestamp: new Date().toISOString(),
            metadata: { message: 'Hi there' }
          }
        ]
        mockProfiles = [createMockProfile('0xrequested1'), createMockProfile('0xrequested2')]

        mockFriendsDB.getSentFriendshipRequests.mockResolvedValue(mockSentRequests)
        mockFriendsDB.getSentFriendshipRequestsCount.mockResolvedValue(2)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should return sent requests with total count', async () => {
        const result = await friendsComponent.getSentFriendshipRequests(userAddress, pagination)

        expect(result).toEqual({
          requests: expect.any(Array),
          profiles: expect.any(Array),
          total: 2
        })

        expect(mockFriendsDB.getSentFriendshipRequests).toHaveBeenCalledWith(userAddress, pagination)
        expect(mockFriendsDB.getSentFriendshipRequestsCount).toHaveBeenCalledWith(userAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xrequested1', '0xrequested2'])
      })
    })

    describe('and there are no sent requests', () => {
      beforeEach(() => {
        mockFriendsDB.getSentFriendshipRequests.mockResolvedValue([])
        mockFriendsDB.getSentFriendshipRequestsCount.mockResolvedValue(0)
        mockCatalystClient.getProfiles.mockResolvedValue([])
      })

      it('should return empty requests array with zero total', async () => {
        const result = await friendsComponent.getSentFriendshipRequests(userAddress, pagination)

        expect(result).toEqual({
          requests: [],
          profiles: [],
          total: 0
        })

        expect(mockFriendsDB.getSentFriendshipRequests).toHaveBeenCalledWith(userAddress, pagination)
        expect(mockFriendsDB.getSentFriendshipRequestsCount).toHaveBeenCalledWith(userAddress)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
      })
    })

    describe('and the database returns an error', () => {
      beforeEach(() => {
        mockFriendsDB.getSentFriendshipRequests.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getSentFriendshipRequests(userAddress, pagination)).rejects.toThrow(
          'Database connection failed'
        )

        expect(mockFriendsDB.getSentFriendshipRequests).toHaveBeenCalledWith(userAddress, pagination)
        expect(mockFriendsDB.getSentFriendshipRequestsCount).toHaveBeenCalledWith(userAddress)
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })
  })

  describe('when getting friendship status', () => {
    describe('and there is a friendship action', () => {
      const mockFriendshipAction = {
        id: 'action-id',
        friendship_id: 'friendship-id',
        acting_user: '0x123',
        action: 'REQUEST' as any,
        timestamp: new Date().toISOString()
      }

      beforeEach(() => {
        mockFriendsDB.getLastFriendshipActionByUsers.mockResolvedValue(mockFriendshipAction)
      })

      it('should return the friendship status for the latest action', async () => {
        const result = await friendsComponent.getFriendshipStatus('0x123', '0x456')

        expect(result).toBeDefined()
        expect(mockFriendsDB.getLastFriendshipActionByUsers).toHaveBeenCalledWith('0x123', '0x456')
      })
    })

    describe('and there is no friendship action', () => {
      beforeEach(() => {
        mockFriendsDB.getLastFriendshipActionByUsers.mockResolvedValue(null)
      })

      it('should return NONE status', async () => {
        const result = await friendsComponent.getFriendshipStatus('0x123', '0x456')

        expect(result).toBeDefined()
        expect(mockFriendsDB.getLastFriendshipActionByUsers).toHaveBeenCalledWith('0x123', '0x456')
      })
    })

    describe('and the database returns an error', () => {
      beforeEach(() => {
        mockFriendsDB.getLastFriendshipActionByUsers.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getFriendshipStatus('0x123', '0x456')).rejects.toThrow(
          'Database connection failed'
        )

        expect(mockFriendsDB.getLastFriendshipActionByUsers).toHaveBeenCalledWith('0x123', '0x456')
      })
    })
  })

  describe('when blocking a user', () => {
    let mockProfile: Profile
    let mockClient: jest.Mocked<PoolClient>
    let blockedAddress: EthAddress
    let blockedAt: Date

    beforeEach(() => {
      mockClient = {} as jest.Mocked<PoolClient>
      mockFriendsDB.executeTx.mockImplementationOnce(async (cb) => cb(mockClient))
      blockedAddress = '0x12356abC4078a0Cc3b89b419928b857B8AF826ef'
      mockProfile = createMockProfile(blockedAddress)
      blockedAt = new Date()
    })

    describe('and the profile is not found', () => {
      beforeEach(() => {
        mockCatalystClient.getProfile.mockResolvedValueOnce(null)
      })

      it('should reject with a profileNotFound error', async () => {
        await expect(friendsComponent.blockUser(mockUserAddress, blockedAddress)).rejects.toThrow(
          `Profile not found for address ${blockedAddress}`
        )
      })
    })

    describe('and there is an error blocking the user', () => {
      beforeEach(() => {
        mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
        mockFriendsDB.blockUser.mockRejectedValueOnce(new Error('Error blocking user'))
      })

      it('should reject with the error', async () => {
        await expect(friendsComponent.blockUser(mockUserAddress, blockedAddress)).rejects.toThrow('Error blocking user')
      })
    })

    describe('and the user is friends with the blocked user', () => {
      beforeEach(() => {
        mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
        mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
        mockFriendsDB.recordFriendshipAction.mockResolvedValueOnce('action-id')
        mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })
      })

      it('should block the user successfully, update the friendship status, and record the friendship action', async () => {
        await friendsComponent.blockUser(mockUserAddress, blockedAddress)

        expect(mockFriendsDB.blockUser).toHaveBeenCalledWith(mockUserAddress, blockedAddress, mockClient)
        expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([mockUserAddress, blockedAddress], mockClient)
        expect(mockFriendsDB.updateFriendshipStatus).toHaveBeenCalledWith(expect.any(String), false, mockClient)
        expect(mockFriendsDB.recordFriendshipAction).toHaveBeenCalledWith(
          'friendship-id',
          mockUserAddress,
          Action.BLOCK,
          null,
          mockClient
        )
      })

      it('should publish a friendship update event', async () => {
        await friendsComponent.blockUser(mockUserAddress, blockedAddress)

        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, {
          id: 'action-id',
          from: mockUserAddress,
          to: blockedAddress,
          action: Action.BLOCK,
          timestamp: blockedAt.getTime()
        })
      })

      it('should publish a block update event', async () => {
        await friendsComponent.blockUser(mockUserAddress, blockedAddress)

        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, {
          blockerAddress: mockUserAddress,
          blockedAddress,
          isBlocked: true
        })
      })

      it('should resolve with the blocked user profile and the time it was blocked', async () => {
        const result = await friendsComponent.blockUser(mockUserAddress, blockedAddress)

        expect(result).toEqual({
          profile: mockProfile,
          blockedAt: blockedAt
        })
      })
    })

    describe('and the user is not friends with the blocked user', () => {
      beforeEach(() => {
        mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
        mockFriendsDB.getFriendship.mockResolvedValueOnce(null)
        mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })
      })

      it('should block the user successfully and not update the friendship status nor record the friendship action', async () => {
        await friendsComponent.blockUser(mockUserAddress, blockedAddress)

        expect(mockFriendsDB.blockUser).toHaveBeenCalledWith(mockUserAddress, blockedAddress, mockClient)
        expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([mockUserAddress, blockedAddress], mockClient)
        expect(mockFriendsDB.updateFriendshipStatus).not.toHaveBeenCalled()
        expect(mockFriendsDB.recordFriendshipAction).not.toHaveBeenCalled()
      })

      it('should publish only the block update event', async () => {
        await friendsComponent.blockUser(mockUserAddress, blockedAddress)

        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, {
          blockerAddress: mockUserAddress,
          blockedAddress,
          isBlocked: true
        })
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, expect.any(Object))
      })

      it('should resolve with the blocked user profile and the time it was blocked', async () => {
        const result = await friendsComponent.blockUser(mockUserAddress, blockedAddress)

        expect(result).toEqual({
          profile: mockProfile,
          blockedAt: blockedAt
        })
      })
    })
  })

  describe('when unblocking a user', () => {
    let mockProfile: Profile
    let mockClient: jest.Mocked<PoolClient>
    let blockedAddress: EthAddress
    let blockedAt: Date

    beforeEach(() => {
      mockClient = {} as jest.Mocked<PoolClient>
      mockFriendsDB.executeTx.mockImplementationOnce(async (cb) => cb(mockClient))
      blockedAddress = '0x12356abC4078a0Cc3b89b419928b857B8AF826ef'
      mockProfile = createMockProfile(blockedAddress)
      blockedAt = new Date()
    })

    describe('and the profile is not found', () => {
      beforeEach(() => {
        mockCatalystClient.getProfile.mockResolvedValueOnce(null)
      })

      it('should reject with a profileNotFound error', async () => {
        await expect(friendsComponent.unblockUser(mockUserAddress, blockedAddress)).rejects.toThrow(
          `Profile not found for address ${blockedAddress}`
        )
      })
    })

    describe('and there is an error unblocking the user', () => {
      beforeEach(() => {
        mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
        mockFriendsDB.unblockUser.mockRejectedValueOnce(new Error('Error unblocking user'))
      })

      it('should reject with the error', async () => {
        await expect(friendsComponent.unblockUser(mockUserAddress, blockedAddress)).rejects.toThrow(
          'Error unblocking user'
        )
      })
    })

    describe('and the user is friends with the blocked user', () => {
      let now: number

      beforeEach(() => {
        now = Date.now()
        jest.spyOn(Date, 'now').mockReturnValueOnce(now)
        mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
        mockFriendsDB.unblockUser.mockResolvedValueOnce(undefined)
        mockFriendsDB.recordFriendshipAction.mockResolvedValueOnce('action-id')
        mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
      })

      it('should unblock the user successfully and record the friendship action', async () => {
        await friendsComponent.unblockUser(mockUserAddress, blockedAddress)

        expect(mockFriendsDB.unblockUser).toHaveBeenCalledWith(mockUserAddress, blockedAddress, mockClient)
        expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([mockUserAddress, blockedAddress], mockClient)
        expect(mockFriendsDB.recordFriendshipAction).toHaveBeenCalledWith(
          'friendship-id',
          mockUserAddress,
          Action.DELETE,
          null,
          mockClient
        )
      })

      it('should publish a friendship update event', async () => {
        await friendsComponent.unblockUser(mockUserAddress, blockedAddress)

        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, {
          id: 'action-id',
          from: mockUserAddress,
          to: blockedAddress,
          action: Action.DELETE,
          timestamp: now
        })
      })

      it('should publish a block update event', async () => {
        await friendsComponent.unblockUser(mockUserAddress, blockedAddress)

        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, {
          blockerAddress: mockUserAddress,
          blockedAddress,
          isBlocked: false
        })
      })

      it('should resolve with the unblocked user profile', async () => {
        const result = await friendsComponent.unblockUser(mockUserAddress, blockedAddress)

        expect(result).toEqual(mockProfile)
      })
    })

    describe('and the user is not friends with the blocked user', () => {
      beforeEach(() => {
        mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
        mockFriendsDB.unblockUser.mockResolvedValueOnce(undefined)
        mockFriendsDB.getFriendship.mockResolvedValueOnce(null)
      })

      it('should unblock the user successfully and not record the friendship action', async () => {
        await friendsComponent.unblockUser(mockUserAddress, blockedAddress)

        expect(mockFriendsDB.unblockUser).toHaveBeenCalledWith(mockUserAddress, blockedAddress, mockClient)
        expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([mockUserAddress, blockedAddress], mockClient)
        expect(mockFriendsDB.recordFriendshipAction).not.toHaveBeenCalled()
      })

      it('should publish only the block update event', async () => {
        await friendsComponent.unblockUser(mockUserAddress, blockedAddress)

        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, {
          blockerAddress: mockUserAddress,
          blockedAddress,
          isBlocked: false
        })
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, expect.any(Object))
      })

      it('should resolve with the unblocked user profile', async () => {
        const result = await friendsComponent.unblockUser(mockUserAddress, blockedAddress)

        expect(result).toEqual(mockProfile)
      })
    })
  })
})
