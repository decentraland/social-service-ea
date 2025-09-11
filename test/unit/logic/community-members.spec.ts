import { CommunityRole } from '../../../src/types'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs, mockCatalystClient, createMockPeersStatsComponent, mockPubSub } from '../../mocks/components'
import { createCommsGatekeeperMockedComponent } from '../../mocks/components/comms-gatekeeper'
import { createCommunityMembersComponent } from '../../../src/logic/community/members'
import {
  CommunityPrivacyEnum,
  ICommunityBroadcasterComponent,
  ICommunityMembersComponent,
  ICommunityRolesComponent,
  ICommunityThumbnailComponent
} from '../../../src/logic/community/types'
import {
  createMockCommunityBroadcasterComponent,
  createMockCommunityRolesComponent,
  createMockCommunityThumbnailComponent
} from '../../mocks/communities'
import { createMockProfile } from '../../mocks/profile'
import { CommunityMember, CommunityMemberProfile } from '../../../src/logic/community/types'
import { IPeersStatsComponent } from '../../../src/logic/peers-stats'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { Events } from '@dcl/schemas'

describe('Community Members Component', () => {
  let communityMembersComponent: ICommunityMembersComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockCommunityThumbnail: jest.Mocked<ICommunityThumbnailComponent>
  let mockCommunityBroadcaster: jest.Mocked<ICommunityBroadcasterComponent>
  let mockUserAddress: string
  let mockPeersStats: jest.Mocked<IPeersStatsComponent>
  let mockCommsGatekeeper: ReturnType<typeof createCommsGatekeeperMockedComponent>

  const communityId = 'test-community'
  const mockCommunityMembers: CommunityMember[] = [
    {
      communityId,
      memberAddress: '0x1234567890123456789012345678901234567890',
      role: CommunityRole.Member,
      joinedAt: '2023-01-01T00:00:00Z',
      lastFriendshipAction: undefined,
      actingUser: undefined
    },
    {
      communityId,
      memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      role: CommunityRole.Moderator,
      joinedAt: '2023-01-02T00:00:00Z',
      lastFriendshipAction: undefined,
      actingUser: undefined
    }
  ]

  beforeEach(async () => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockCommunityRoles = createMockCommunityRolesComponent({})
    mockCommunityThumbnail = createMockCommunityThumbnailComponent({})
    mockCommunityBroadcaster = createMockCommunityBroadcasterComponent({})
    mockPeersStats = createMockPeersStatsComponent()
    mockCommsGatekeeper = createCommsGatekeeperMockedComponent({})
    communityMembersComponent = await createCommunityMembersComponent({
      communitiesDb: mockCommunitiesDB,
      catalystClient: mockCatalystClient,
      communityRoles: mockCommunityRoles,
      communityThumbnail: mockCommunityThumbnail,
      communityBroadcaster: mockCommunityBroadcaster,
      logs: mockLogs,
      peersStats: mockPeersStats,
      pubsub: mockPubSub,
      commsGatekeeper: mockCommsGatekeeper
    })
  })

  describe('when getting community members', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const options = { pagination: { limit: 10, offset: 0 }, onlyOnline: false }
    const mockProfiles = [
      createMockProfile('0x1234567890123456789012345678901234567890'),
      createMockProfile('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    ]
    let community: any
    let onlinePeers: string[]

    beforeEach(() => {
      community = null
      onlinePeers = []
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockCommunityMembers)
      mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(2)
      mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      mockPeersStats.getConnectedPeers.mockResolvedValue(onlinePeers)
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the community is public', () => {
        beforeEach(() => {
          community = {
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            privacy: CommunityPrivacyEnum.Public,
            active: true,
            ownerAddress: '0xowner',
            role: CommunityRole.Member
          }
          mockCommunitiesDB.getCommunity.mockResolvedValue(community)
        })

        describe('and only online members are not requested', () => {
          it('should return community members with profiles', async () => {
            const result = await communityMembersComponent.getCommunityMembers(communityId, {
              ...options,
              as: userAddress
            })

            expect(result).toEqual({
              members: expect.arrayContaining([
                expect.objectContaining({
                  memberAddress: mockCommunityMembers[0].memberAddress,
                  role: mockCommunityMembers[0].role,
                  joinedAt: mockCommunityMembers[0].joinedAt,
                  name: 'Profile name 0x1234567890123456789012345678901234567890',
                  hasClaimedName: true,
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org')
                }),
                expect.objectContaining({
                  memberAddress: mockCommunityMembers[1].memberAddress,
                  role: mockCommunityMembers[1].role,
                  joinedAt: mockCommunityMembers[1].joinedAt,
                  name: 'Profile name 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
                  hasClaimedName: true,
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org')
                })
              ]),
              totalMembers: 2
            })

            expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
              userAddress,
              pagination: options.pagination,
              filterByMembers: undefined
            })
            expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId, {
              filterByMembers: undefined
            })
            expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(
              mockCommunityMembers.map((member) => member.memberAddress)
            )
          })
        })

        describe('and only online members are requested', () => {
          const onlineOptions = { pagination: { limit: 10, offset: 0 }, onlyOnline: true }

          beforeEach(() => {
            onlinePeers = ['0x1234567890123456789012345678901234567890']
            mockPeersStats.getConnectedPeers.mockResolvedValue(onlinePeers)
            mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockCommunityMembers.slice(0, 1))
            mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(1)
            mockCatalystClient.getProfiles.mockResolvedValue([mockProfiles[0]])
          })

          it('should filter by online peers', async () => {
            await communityMembersComponent.getCommunityMembers(communityId, { ...onlineOptions, as: userAddress })

            expect(mockPeersStats.getConnectedPeers).toHaveBeenCalled()
            expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
              userAddress,
              pagination: onlineOptions.pagination,
              filterByMembers: onlinePeers
            })
            expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId, {
              filterByMembers: onlinePeers
            })
          })
        })
      })

      describe('and the community is private', () => {
        beforeEach(() => {
          community = {
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            privacy: CommunityPrivacyEnum.Private,
            active: true,
            ownerAddress: '0xowner',
            role: CommunityRole.Member
          }
          mockCommunitiesDB.getCommunity.mockResolvedValue(community)
        })

        describe('and the user is a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
          })

          it('should return community members with profiles', async () => {
            const result = await communityMembersComponent.getCommunityMembers(communityId, {
              ...options,
              as: userAddress
            })

            expect(result).toEqual({
              members: expect.arrayContaining([
                expect.objectContaining({
                  memberAddress: mockCommunityMembers[0].memberAddress,
                  role: mockCommunityMembers[0].role,
                  joinedAt: mockCommunityMembers[0].joinedAt,
                  name: 'Profile name 0x1234567890123456789012345678901234567890',
                  hasClaimedName: true,
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org')
                })
              ]),
              totalMembers: 2
            })

            expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
              userAddress,
              pagination: options.pagination,
              filterByMembers: undefined
            })
          })
        })

        describe('and the user is not a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityMembersComponent.getCommunityMembers(communityId, { ...options, as: userAddress })
            ).rejects.toThrow(new NotAuthorizedError("The user doesn't have permission to get community members"))

            expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDB.getCommunityMembers).not.toHaveBeenCalled()
            expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
          })
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(
          communityMembersComponent.getCommunityMembers(communityId, { ...options, as: userAddress })
        ).rejects.toThrow(new CommunityNotFoundError(communityId))

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunityMembers).not.toHaveBeenCalled()
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })
  })

  describe('when getting members from public community', () => {
    const options = { pagination: { limit: 10, offset: 0 }, onlyOnline: false }
    const mockProfiles = [
      createMockProfile('0x1234567890123456789012345678901234567890'),
      createMockProfile('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    ]
    let community: any

    beforeEach(() => {
      community = null
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockCommunityMembers)
      mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(2)
      mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        community = {
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          privacy: CommunityPrivacyEnum.Public,
          active: true,
          ownerAddress: '0xowner',
          role: CommunityRole.Member
        }
        mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      })

      it('should return community members with profiles', async () => {
        const result = await communityMembersComponent.getCommunityMembers(communityId, options)

        expect(result).toEqual({
          members: expect.arrayContaining([
            expect.objectContaining({
              memberAddress: mockCommunityMembers[0].memberAddress,
              role: mockCommunityMembers[0].role,
              joinedAt: mockCommunityMembers[0].joinedAt,
              name: 'Profile name 0x1234567890123456789012345678901234567890',
              hasClaimedName: true,
              profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org')
            })
          ]),
          totalMembers: 2
        })

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: true })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
          userAddress: undefined,
          pagination: options.pagination,
          filterByMembers: undefined
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityMembersComponent.getCommunityMembers(communityId, options)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: true })
        expect(mockCommunitiesDB.getCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunityMembers).not.toHaveBeenCalled()
      })
    })
  })

  describe('when getting online members from communities a user belongs to', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const onlineUsers = ['0x1234567890123456789012345678901234567890', '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd']

    beforeEach(() => {
      mockCommunitiesDB.getOnlineMembersFromUserCommunities.mockResolvedValue([
        { communityId: '1', memberAddress: '0x1234567890123456789012345678901234567890' },
        { communityId: '2', memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' }
      ])
    })

    it('should return the members that are online from all the communities a user belongs to', async () => {
      const generator = communityMembersComponent.getOnlineMembersFromUserCommunities(userAddress, onlineUsers)
      const results: Array<{ communityId: string; memberAddress: string }> = []

      for await (const batch of generator) {
        results.push(...batch)
      }

      expect(mockCommunitiesDB.getOnlineMembersFromUserCommunities).toHaveBeenCalledWith(userAddress, onlineUsers, {
        limit: 100,
        offset: 0
      })

      expect(results).toEqual([
        { communityId: '1', memberAddress: '0x1234567890123456789012345678901234567890' },
        { communityId: '2', memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' }
      ])
    })

    describe('when there are multiple batches', () => {
      beforeEach(() => {
        // First call returns a full batch
        mockCommunitiesDB.getOnlineMembersFromUserCommunities
          .mockResolvedValueOnce([
            { communityId: '1', memberAddress: '0x1234567890123456789012345678901234567890' },
            { communityId: '2', memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' }
          ])
          // Second call returns a partial batch (indicating end)
          .mockResolvedValueOnce([{ communityId: '3', memberAddress: '0x9999999999999999999999999999999999999999' }])
      })

      it('should yield all batches correctly', async () => {
        const generator = communityMembersComponent.getOnlineMembersFromUserCommunities(userAddress, onlineUsers, 2)
        const results: Array<{ communityId: string; memberAddress: string }> = []

        for await (const batch of generator) {
          results.push(...batch)
        }

        expect(mockCommunitiesDB.getOnlineMembersFromUserCommunities).toHaveBeenCalledTimes(2)
        expect(mockCommunitiesDB.getOnlineMembersFromUserCommunities).toHaveBeenNthCalledWith(
          1,
          userAddress,
          onlineUsers,
          {
            limit: 2,
            offset: 0
          }
        )
        expect(mockCommunitiesDB.getOnlineMembersFromUserCommunities).toHaveBeenNthCalledWith(
          2,
          userAddress,
          onlineUsers,
          {
            limit: 2,
            offset: 2
          }
        )

        expect(results).toEqual([
          { communityId: '1', memberAddress: '0x1234567890123456789012345678901234567890' },
          { communityId: '2', memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
          { communityId: '3', memberAddress: '0x9999999999999999999999999999999999999999' }
        ])
      })
    })

    describe('when there are no results', () => {
      beforeEach(() => {
        mockCommunitiesDB.getOnlineMembersFromUserCommunities.mockResolvedValue([])
      })

      it('should not yield any batches', async () => {
        const generator = communityMembersComponent.getOnlineMembersFromUserCommunities(userAddress, onlineUsers)
        const results: Array<{ communityId: string; memberAddress: string }> = []

        for await (const batch of generator) {
          results.push(...batch)
        }

        expect(mockCommunitiesDB.getOnlineMembersFromUserCommunities).toHaveBeenCalledWith(userAddress, onlineUsers, {
          limit: 100,
          offset: 0
        })

        expect(results).toEqual([])
      })
    })

    describe('when using custom batch size', () => {
      it('should use the provided batch size', async () => {
        const generator = communityMembersComponent.getOnlineMembersFromUserCommunities(userAddress, onlineUsers, 50)
        const results: Array<{ communityId: string; memberAddress: string }> = []

        for await (const batch of generator) {
          results.push(...batch)
        }

        expect(mockCommunitiesDB.getOnlineMembersFromUserCommunities).toHaveBeenCalledWith(userAddress, onlineUsers, {
          limit: 50,
          offset: 0
        })
      })
    })
  })

  describe('when getting online members from a specific community', () => {
    const communityId = 'test-community'
    let onlineUsers: string[]

    beforeEach(() => {
      mockCommunitiesDB.getCommunityMembers.mockResolvedValue([
        {
          communityId,
          memberAddress: '0x1234567890123456789012345678901234567890',
          role: CommunityRole.Member,
          joinedAt: '2023-01-01T00:00:00Z'
        },
        {
          communityId,
          memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          role: CommunityRole.Moderator,
          joinedAt: '2023-01-02T00:00:00Z'
        }
      ])
      onlineUsers = ['0x1234567890123456789012345678901234567890', '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd']
    })

    describe('when there is a single batch', () => {
      it('should return the members that are online from the specific community', async () => {
        const generator = communityMembersComponent.getOnlineMembersFromCommunity(communityId, onlineUsers)
        const results: Array<{ memberAddress: string }> = []

        for await (const batch of generator) {
          results.push(...batch)
        }

        expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
          pagination: { limit: 100, offset: 0 },
          filterByMembers: onlineUsers
        })

        expect(results).toEqual([
          { memberAddress: '0x1234567890123456789012345678901234567890' },
          { memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' }
        ])
      })
    })

    describe('when there are multiple batches', () => {
      beforeEach(() => {
        // First call returns a full batch
        mockCommunitiesDB.getCommunityMembers
          .mockResolvedValueOnce([
            {
              communityId,
              memberAddress: '0x1234567890123456789012345678901234567890',
              role: CommunityRole.Member,
              joinedAt: '2023-01-01T00:00:00Z'
            },
            {
              communityId,
              memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
              role: CommunityRole.Moderator,
              joinedAt: '2023-01-02T00:00:00Z'
            }
          ])
          // Second call returns a partial batch (indicating end)
          .mockResolvedValueOnce([
            {
              communityId,
              memberAddress: '0x9999999999999999999999999999999999999999',
              role: CommunityRole.Member,
              joinedAt: '2023-01-03T00:00:00Z'
            }
          ])
      })

      it('should yield all batches correctly', async () => {
        const generator = communityMembersComponent.getOnlineMembersFromCommunity(communityId, onlineUsers, 2)
        const results: Array<{ memberAddress: string }> = []

        for await (const batch of generator) {
          results.push(...batch)
        }

        expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledTimes(2)
        expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenNthCalledWith(1, communityId, {
          pagination: { limit: 2, offset: 0 },
          filterByMembers: onlineUsers
        })
        expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenNthCalledWith(2, communityId, {
          pagination: { limit: 2, offset: 2 },
          filterByMembers: onlineUsers
        })

        expect(results).toEqual([
          { memberAddress: '0x1234567890123456789012345678901234567890' },
          { memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
          { memberAddress: '0x9999999999999999999999999999999999999999' }
        ])
      })
    })

    describe('when there are no results', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMembers.mockResolvedValue([])
      })

      it('should not yield any batches', async () => {
        const generator = communityMembersComponent.getOnlineMembersFromCommunity(communityId, onlineUsers)
        const results: Array<{ memberAddress: string }> = []

        for await (const batch of generator) {
          results.push(...batch)
        }

        expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
          pagination: { limit: 100, offset: 0 },
          filterByMembers: onlineUsers
        })

        expect(results).toEqual([])
      })
    })

    describe('when using custom batch size', () => {
      it('should use the provided batch size', async () => {
        const generator = communityMembersComponent.getOnlineMembersFromCommunity(communityId, onlineUsers, 50)
        const results: Array<{ memberAddress: string }> = []

        for await (const batch of generator) {
          results.push(...batch)
        }

        expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
          pagination: { limit: 50, offset: 0 },
          filterByMembers: onlineUsers
        })
      })
    })
  })

  describe('when kicking a member from a community', () => {
    const kickerAddress = '0x9876543210987654321098765432109876543210'
    const targetAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    let isMember: boolean

    beforeEach(() => {
      isMember = false
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunitiesDB.getCommunity.mockResolvedValue({
        id: communityId,
        name: 'Test Community',
        description: 'Test Description',
        active: true,
        ownerAddress: kickerAddress,
        privacy: CommunityPrivacyEnum.Public,
        role: CommunityRole.Owner
      })
      mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(isMember)
      mockCommunityRoles.validatePermissionToKickMemberFromCommunity.mockResolvedValue()
      mockCommunitiesDB.kickMemberFromCommunity.mockResolvedValue()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          active: true,
          ownerAddress: kickerAddress,
          privacy: CommunityPrivacyEnum.Public,
          role: CommunityRole.Owner
        })
      })

      describe('and the target is a member', () => {
        beforeEach(() => {
          isMember = true
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(isMember)
        })

        describe('and the user has permission to kick', () => {
          beforeEach(() => {
            mockCommunityRoles.validatePermissionToKickMemberFromCommunity.mockResolvedValue()
          })

          it('should kick the member from the community', async () => {
            await communityMembersComponent.kickMember(communityId, kickerAddress, targetAddress)

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
            expect(mockCommunityRoles.validatePermissionToKickMemberFromCommunity).toHaveBeenCalledWith(
              communityId,
              kickerAddress,
              targetAddress
            )
            expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, targetAddress)
            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
              communityId,
              memberAddress: targetAddress,
              status: ConnectivityStatus.OFFLINE
            })
          })

          it('should publish event to notify member kick', async () => {
            await communityMembersComponent.kickMember(communityId, kickerAddress, targetAddress)

            // Wait for setImmediate callback to execute
            await new Promise((resolve) => setImmediate(resolve))
            expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
              type: Events.Type.COMMUNITY,
              subType: Events.SubType.Community.MEMBER_REMOVED,
              key: expect.stringContaining(`${communityId}-${targetAddress}-`),
              timestamp: expect.any(Number),
              metadata: {
                id: communityId,
                name: expect.any(String),
                memberAddress: targetAddress
              }
            })
          })
        })

        describe('and the user does not have permission to kick', () => {
          beforeEach(() => {
            const permissionError = new NotAuthorizedError(
              `The user ${kickerAddress} doesn't have permission to kick ${targetAddress} from community ${communityId}`
            )
            mockCommunityRoles.validatePermissionToKickMemberFromCommunity.mockRejectedValue(permissionError)
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityMembersComponent.kickMember(communityId, kickerAddress, targetAddress)
            ).rejects.toThrow(
              new NotAuthorizedError(
                `The user ${kickerAddress} doesn't have permission to kick ${targetAddress} from community ${communityId}`
              )
            )

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
            expect(mockCommunityRoles.validatePermissionToKickMemberFromCommunity).toHaveBeenCalledWith(
              communityId,
              kickerAddress,
              targetAddress
            )
            expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
            expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
          })
        })
      })

      describe('and the target is not a member', () => {
        beforeEach(() => {
          isMember = false
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(isMember)
        })

        it('should return without kicking', async () => {
          await communityMembersComponent.kickMember(communityId, kickerAddress, targetAddress)

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
          expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
          expect(mockCommunityRoles.validatePermissionToKickMemberFromCommunity).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
          expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityMembersComponent.kickMember(communityId, kickerAddress, targetAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunityRoles.validatePermissionToKickMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
      })
    })
  })

  describe('when joining a community', () => {
    const memberAddress = '0x1234567890123456789012345678901234567890'
    let isMember: boolean
    let isBanned: boolean

    beforeEach(() => {
      isMember = false
      isBanned = false
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(isMember)
      mockCommunitiesDB.isMemberBanned.mockResolvedValue(isBanned)
      mockCommunitiesDB.addCommunityMember.mockResolvedValue()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the user is not already a member', () => {
        beforeEach(() => {
          isMember = false
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(isMember)
        })

        describe('and the user is not banned', () => {
          beforeEach(() => {
            isBanned = false
            mockCommunitiesDB.isMemberBanned.mockResolvedValue(isBanned)
          })

          it('should add the member to the community', async () => {
            await communityMembersComponent.joinCommunity(communityId, memberAddress)

            expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
            expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(communityId, memberAddress)
            expect(mockCommunitiesDB.addCommunityMember).toHaveBeenCalledWith({
              communityId,
              memberAddress,
              role: CommunityRole.Member
            })
            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
              communityId,
              memberAddress,
              status: ConnectivityStatus.ONLINE
            })
          })
        })

        describe('and the user is banned', () => {
          beforeEach(() => {
            isBanned = true
            mockCommunitiesDB.isMemberBanned.mockResolvedValue(isBanned)
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(communityMembersComponent.joinCommunity(communityId, memberAddress)).rejects.toThrow(
              new NotAuthorizedError(`The user ${memberAddress} is banned from community ${communityId}`)
            )

            expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
            expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(communityId, memberAddress)
            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
          })
        })
      })

      describe('and the user is already a member', () => {
        beforeEach(() => {
          isMember = true
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(isMember)
        })

        it('should return without adding', async () => {
          await communityMembersComponent.joinCommunity(communityId, memberAddress)

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
          expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
          expect(mockCommunitiesDB.isMemberBanned).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
          expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityMembersComponent.joinCommunity(communityId, memberAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.isMemberBanned).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
      })
    })
  })

  describe('when leaving a community', () => {
    const memberAddress = '0x1234567890123456789012345678901234567890'
    let isMember: boolean

    beforeEach(() => {
      isMember = false
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(isMember)
      mockCommunityRoles.validatePermissionToLeaveCommunity.mockResolvedValue()
      mockCommunitiesDB.kickMemberFromCommunity.mockResolvedValue()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the user is a member', () => {
        beforeEach(() => {
          isMember = true
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(isMember)
        })

        describe('and the user has permission to leave', () => {
          beforeEach(() => {
            mockCommunityRoles.validatePermissionToLeaveCommunity.mockResolvedValue()
          })

          it('should remove the member from the community', async () => {
            await communityMembersComponent.leaveCommunity(communityId, memberAddress)

            expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
            expect(mockCommunityRoles.validatePermissionToLeaveCommunity).toHaveBeenCalledWith(
              communityId,
              memberAddress
            )
            expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, memberAddress)
            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
              communityId,
              memberAddress,
              status: ConnectivityStatus.OFFLINE
            })
          })
        })

        describe('and the user does not have permission to leave', () => {
          beforeEach(() => {
            const permissionError = new NotAuthorizedError(`The owner cannot leave the community ${communityId}`)
            mockCommunityRoles.validatePermissionToLeaveCommunity.mockRejectedValue(permissionError)
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(communityMembersComponent.leaveCommunity(communityId, memberAddress)).rejects.toThrow(
              new NotAuthorizedError(`The owner cannot leave the community ${communityId}`)
            )

            expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
            expect(mockCommunityRoles.validatePermissionToLeaveCommunity).toHaveBeenCalledWith(
              communityId,
              memberAddress
            )
            expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
            expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
          })
        })
      })

      describe('and the user is not a member', () => {
        beforeEach(() => {
          isMember = false
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(isMember)
        })

        it('should return without removing', async () => {
          await communityMembersComponent.leaveCommunity(communityId, memberAddress)

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
          expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
          expect(mockCommunityRoles.validatePermissionToLeaveCommunity).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
          expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityMembersComponent.leaveCommunity(communityId, memberAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunityRoles.validatePermissionToLeaveCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
      })
    })
  })

  describe('when updating a member role', () => {
    const updaterAddress = '0x9876543210987654321098765432109876543210'
    const targetAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    const newRole = CommunityRole.Moderator

    beforeEach(() => {
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunityRoles.validatePermissionToUpdateMemberRole.mockResolvedValue()
      mockCommunitiesDB.updateMemberRole.mockResolvedValue()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the user has permission to update roles', () => {
        beforeEach(() => {
          mockCommunityRoles.validatePermissionToUpdateMemberRole.mockResolvedValue()
        })

        it('should update the member role', async () => {
          await communityMembersComponent.updateMemberRole(communityId, updaterAddress, targetAddress, newRole)

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
          expect(mockCommunityRoles.validatePermissionToUpdateMemberRole).toHaveBeenCalledWith(
            communityId,
            updaterAddress,
            targetAddress,
            newRole
          )
          expect(mockCommunitiesDB.updateMemberRole).toHaveBeenCalledWith(communityId, targetAddress, newRole)
        })
      })

      describe('and the user does not have permission to update roles', () => {
        beforeEach(() => {
          const permissionError = new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
          mockCommunityRoles.validatePermissionToUpdateMemberRole.mockRejectedValue(permissionError)
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            communityMembersComponent.updateMemberRole(communityId, updaterAddress, targetAddress, newRole)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
          expect(mockCommunityRoles.validatePermissionToUpdateMemberRole).toHaveBeenCalledWith(
            communityId,
            updaterAddress,
            targetAddress,
            newRole
          )
          expect(mockCommunitiesDB.updateMemberRole).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(
          communityMembersComponent.updateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(new CommunityNotFoundError(communityId))

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToUpdateMemberRole).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.updateMemberRole).not.toHaveBeenCalled()
      })
    })
  })
})
