import { EthAddress } from '@dcl/schemas'
import { PoolClient } from 'pg'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createFriendsComponent } from '../../../src/logic/friends/component'
import { IFriendsComponent } from '../../../src/logic/friends/types'
import { createFriendsDBMockedComponent } from '../../mocks/components/friends-db'
import { mockCatalystClient } from '../../mocks/components/catalyst-client'
import { createMockProfile } from '../../mocks/profile'
import { createLogsMockedComponent, createMockedPubSubComponent } from '../../mocks/components'
import { Action, Friendship } from '../../../src/types'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { createSNSMockedComponent } from '../../mocks/components/sns'

describe('Friends Component', () => {
  let friendsComponent: IFriendsComponent
  let mockFriendsDB: jest.Mocked<ReturnType<typeof createFriendsDBMockedComponent>>
  let mockPubSub: jest.Mocked<ReturnType<typeof createMockedPubSubComponent>>
  let mockSNS: jest.Mocked<ReturnType<typeof createSNSMockedComponent>>
  let mockPublishInChannel: jest.MockedFunction<typeof mockPubSub.publishInChannel>
  let mockUserAddress: string

  beforeEach(async () => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockFriendsDB = createFriendsDBMockedComponent({})
    mockPublishInChannel = jest.fn()
    mockPubSub = createMockedPubSubComponent({
      publishInChannel: mockPublishInChannel
    })
    mockSNS = createSNSMockedComponent({})
    const logs = createLogsMockedComponent()

    friendsComponent = await createFriendsComponent({
      friendsDb: mockFriendsDB,
      catalystClient: mockCatalystClient,
      pubsub: mockPubSub,
      sns: mockSNS,
      logs
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
