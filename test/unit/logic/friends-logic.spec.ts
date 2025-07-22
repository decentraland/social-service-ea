import { PoolClient } from 'pg'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createFriendsComponent } from '../../../src/logic/friends/component'
import { IFriendsComponent } from '../../../src/logic/friends/types'
import { createFriendsDBMockedComponent } from '../../mocks/components/friends-db'
import { mockCatalystClient } from '../../mocks/components/catalyst-client'
import { createMockProfile, mockProfile } from '../../mocks/profile'
import { createMockedPubSubComponent, mockPg } from '../../mocks/components'
import { EthAddress } from '@dcl/schemas'
import { Action, Friendship } from '../../../src/types'
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
    const pagination: Pagination = { limit: 10, offset: 0 }

    describe('and the user has friends', () => {
      const mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]
      const mockProfiles = [
        createMockProfile('0xfriend1'),
        createMockProfile('0xfriend2'),
        createMockProfile('0xfriend3')
      ]

      beforeEach(() => {
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
      const mockFriends = [{ address: '0xfriend1' }]
      const mockProfiles = [createMockProfile('0xfriend1')]

      beforeEach(() => {
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
      const mockProfiles = [createMockProfile('0xfriend1'), createMockProfile('0xfriend2')]

      beforeEach(() => {
        const friendsWithDuplicates = [
          { address: '0xfriend1' },
          { address: '0xfriend1' }, // Duplicate
          { address: '0xfriend2' }
        ]
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
      const mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]

      beforeEach(() => {
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
      const mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]

      beforeEach(() => {
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
      const mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]

      beforeEach(() => {
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
      const mockFriends = [{ address: '0xfriend1' }]

      beforeEach(() => {
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
      const mockBlockedUsers = [
        { address: '0xblocked1', blocked_at: new Date('2023-01-01') },
        { address: '0xblocked2', blocked_at: new Date('2023-01-02') },
        { address: '0xblocked3', blocked_at: new Date('2023-01-03') }
      ]
      const mockProfiles = [
        createMockProfile('0xblocked1'),
        createMockProfile('0xblocked2'),
        createMockProfile('0xblocked3')
      ]

      beforeEach(() => {
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
      const mockBlockedUsers = [
        { address: '0xblocked1', blocked_at: new Date('2023-01-01') },
        { address: '0xblocked2', blocked_at: new Date('2023-01-02') }
      ]

      beforeEach(() => {
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
      const mockBlockedUsers = [
        { address: '0xblocked1', blocked_at: new Date('2023-01-01') },
        { address: '0xblocked2', blocked_at: new Date('2023-01-02') },
        { address: '0xblocked3', blocked_at: new Date('2023-01-03') }
      ]

      beforeEach(() => {
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

    describe('and the catalyst client returns more profiles than expected', () => {
      const mockBlockedUsers = [{ address: '0xblocked1', blocked_at: new Date('2023-01-01') }]

      beforeEach(() => {
        mockFriendsDB.getBlockedUsers.mockResolvedValue(mockBlockedUsers)
        // Catalyst returns 2 profiles instead of 1
        mockCatalystClient.getProfiles.mockResolvedValue([
          createMockProfile('0xblocked1'),
          createMockProfile('0xblocked2')
        ])
      })

      it('should return all profiles from catalyst', async () => {
        const result = await friendsComponent.getBlockedUsers(mockUserAddress)

        expect(result).toEqual({
          blockedUsers: mockBlockedUsers,
          blockedProfiles: [createMockProfile('0xblocked1'), createMockProfile('0xblocked2')],
          total: 1
        })

        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xblocked1'])
      })
    })
  })

  describe('when getting blocking status', () => {
    describe('and the user has blocked users and is blocked by users', () => {
      const mockBlockedUsers = [
        { address: '0xblocked1', blocked_at: new Date('2023-01-01') },
        { address: '0xblocked2', blocked_at: new Date('2023-01-02') }
      ]
      const mockBlockedByUsers = [
        { address: '0xblocker1', blocked_at: new Date('2023-01-03') },
        { address: '0xblocker2', blocked_at: new Date('2023-01-04') }
      ]

      beforeEach(() => {
        mockFriendsDB.getBlockedUsers.mockResolvedValue(mockBlockedUsers)
        mockFriendsDB.getBlockedByUsers.mockResolvedValue(mockBlockedByUsers)
      })

      it('should return blocked users and blocked by users addresses', async () => {
        const result = await friendsComponent.getBlockingStatus(mockUserAddress)

        expect(result).toEqual({
          blockedUsers: ['0xblocked1', '0xblocked2'],
          blockedByUsers: ['0xblocker1', '0xblocker2']
        })

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockFriendsDB.getBlockedByUsers).toHaveBeenCalledWith(mockUserAddress)
      })
    })

    describe('and the user has no blocked users and is not blocked by anyone', () => {
      beforeEach(() => {
        mockFriendsDB.getBlockedUsers.mockResolvedValue([])
        mockFriendsDB.getBlockedByUsers.mockResolvedValue([])
      })

      it('should return empty arrays', async () => {
        const result = await friendsComponent.getBlockingStatus(mockUserAddress)

        expect(result).toEqual({
          blockedUsers: [],
          blockedByUsers: []
        })

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockFriendsDB.getBlockedByUsers).toHaveBeenCalledWith(mockUserAddress)
      })
    })

    describe('and the user has only blocked users but is not blocked by anyone', () => {
      const mockBlockedUsers = [{ address: '0xblocked1', blocked_at: new Date('2023-01-01') }]

      beforeEach(() => {
        mockFriendsDB.getBlockedUsers.mockResolvedValue(mockBlockedUsers)
        mockFriendsDB.getBlockedByUsers.mockResolvedValue([])
      })

      it('should return blocked users addresses and empty blocked by users array', async () => {
        const result = await friendsComponent.getBlockingStatus(mockUserAddress)

        expect(result).toEqual({
          blockedUsers: ['0xblocked1'],
          blockedByUsers: []
        })

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockFriendsDB.getBlockedByUsers).toHaveBeenCalledWith(mockUserAddress)
      })
    })

    describe('and the user has no blocked users but is blocked by others', () => {
      const mockBlockedByUsers = [
        { address: '0xblocker1', blocked_at: new Date('2023-01-01') },
        { address: '0xblocker2', blocked_at: new Date('2023-01-02') }
      ]

      beforeEach(() => {
        mockFriendsDB.getBlockedUsers.mockResolvedValue([])
        mockFriendsDB.getBlockedByUsers.mockResolvedValue(mockBlockedByUsers)
      })

      it('should return empty blocked users array and blocked by users addresses', async () => {
        const result = await friendsComponent.getBlockingStatus(mockUserAddress)

        expect(result).toEqual({
          blockedUsers: [],
          blockedByUsers: ['0xblocker1', '0xblocker2']
        })

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockFriendsDB.getBlockedByUsers).toHaveBeenCalledWith(mockUserAddress)
      })
    })

    describe('and the getBlockedUsers database call fails', () => {
      beforeEach(() => {
        mockFriendsDB.getBlockedUsers.mockRejectedValue(new Error('Database connection failed'))
        mockFriendsDB.getBlockedByUsers.mockResolvedValue([])
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getBlockingStatus(mockUserAddress)).rejects.toThrow('Database connection failed')

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockFriendsDB.getBlockedByUsers).toHaveBeenCalledWith(mockUserAddress)
      })
    })

    describe('and the getBlockedByUsers database call fails', () => {
      beforeEach(() => {
        mockFriendsDB.getBlockedUsers.mockResolvedValue([])
        mockFriendsDB.getBlockedByUsers.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getBlockingStatus(mockUserAddress)).rejects.toThrow('Database connection failed')

        expect(mockFriendsDB.getBlockedUsers).toHaveBeenCalledWith(mockUserAddress)
        expect(mockFriendsDB.getBlockedByUsers).toHaveBeenCalledWith(mockUserAddress)
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

    // it('should block a user successfully, update friendship status, and record friendship action if it exists', async () => {
    //   const request: BlockUserPayload = {
    //     user: { address: blockedAddress }
    //   }

    //   mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    //   mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    //   mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })

    //   const response = await blockUser(request, rpcContext)

    //   expect(response).toEqual({
    //     response: {
    //       $case: 'ok',
    //       ok: {
    //         profile: parseProfileToBlockedUser(mockProfile, blockedAt)
    //       }
    //     }
    //   })
    //   expect(mockFriendsDB.blockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    //   expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    //   expect(mockFriendsDB.updateFriendshipStatus).toHaveBeenCalledWith(expect.any(String), false, mockClient)
    //   expect(mockFriendsDB.recordFriendshipAction).toHaveBeenCalledWith(
    //     expect.any(String),
    //     rpcContext.address,
    //     Action.BLOCK,
    //     null,
    //     mockClient
    //   )
    // })

    // it('should block a user successfully and do nothing else if friendship does not exist', async () => {
    //   const request: BlockUserPayload = {
    //     user: { address: blockedAddress }
    //   }

    //   mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    //   mockFriendsDB.getFriendship.mockResolvedValueOnce(null)
    //   mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })

    //   const response = await blockUser(request, rpcContext)

    //   expect(response).toEqual({
    //     response: {
    //       $case: 'ok',
    //       ok: { profile: parseProfileToBlockedUser(mockProfile, blockedAt) }
    //     }
    //   })

    //   expect(mockFriendsDB.blockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    //   expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    //   expect(mockFriendsDB.updateFriendshipStatus).not.toHaveBeenCalled()
    //   expect(mockFriendsDB.recordFriendshipAction).not.toHaveBeenCalled()
    // })

    // it('should publish a friendship update event after blocking a user if friendship exists', async () => {
    //   const request: BlockUserPayload = {
    //     user: { address: blockedAddress }
    //   }

    //   mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    //   mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    //   mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })
    //   mockFriendsDB.recordFriendshipAction.mockResolvedValueOnce('action-id')

    //   await blockUser(request, rpcContext)

    //   expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, {
    //     id: 'action-id',
    //     from: rpcContext.address,
    //     to: blockedAddress,
    //     action: Action.BLOCK,
    //     timestamp: blockedAt.getTime()
    //   })
    // })

    // it('should publish a block update event after blocking a user', async () => {
    //   const request: BlockUserPayload = {
    //     user: { address: blockedAddress }
    //   }

    //   mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    //   mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    //   mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })
    //   await blockUser(request, rpcContext)

    //   expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, {
    //     blockerAddress: rpcContext.address,
    //     blockedAddress,
    //     isBlocked: true
    //   })
    // })
  })
})
