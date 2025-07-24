import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs, mockCatalystClient, mockPubSub } from '../../mocks/components'
import { createCommunityBansComponent } from '../../../src/logic/community/bans'
import { ICommunityBansComponent } from '../../../src/logic/community'
import { BannedMember, ICommunityBroadcasterComponent, ICommunityRolesComponent, ICommunityThumbnailComponent } from '../../../src/logic/community/types'
import { createMockCommunityBroadcasterComponent, createMockCommunityRolesComponent, createMockCommunityThumbnailComponent } from '../../mocks/communities'
import { createMockProfile } from '../../mocks/profile'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { mockSns } from '../../mocks/components/sns'
import { Events } from '@dcl/schemas'
import { CommunityRole } from '../../../src/types'

describe('Community Bans Component', () => {
  let communityBansComponent: ICommunityBansComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockCommunityThumbnail: jest.Mocked<ICommunityThumbnailComponent>
  let mockCommunityBroadcaster: jest.Mocked<ICommunityBroadcasterComponent>
  let mockUserAddress: string
  const communityId = 'test-community'
  const mockBannedMembers: BannedMember[] = [
    {
      communityId,
      memberAddress: '0x1234567890123456789012345678901234567890',
      bannedBy: '0x9876543210987654321098765432109876543210',
      bannedAt: '2023-01-01T00:00:00Z',
      lastFriendshipAction: undefined,
      actingUser: undefined
    },
    {
      communityId,
      memberAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      bannedBy: '0x9876543210987654321098765432109876543210',
      bannedAt: '2023-01-02T00:00:00Z',
      lastFriendshipAction: undefined,
      actingUser: undefined
    }
  ]

  beforeEach(async () => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockCommunityRoles = createMockCommunityRolesComponent({})
    mockCommunityThumbnail = createMockCommunityThumbnailComponent({})
    mockCommunityBroadcaster = createMockCommunityBroadcasterComponent({})
    communityBansComponent = await createCommunityBansComponent({
      communitiesDb: mockCommunitiesDB,
      catalystClient: mockCatalystClient,
      communityRoles: mockCommunityRoles,
      communityThumbnail: mockCommunityThumbnail,
      communityBroadcaster: mockCommunityBroadcaster,
      logs: mockLogs,
      pubsub: mockPubSub
    })
  })

  describe('banMember', () => {
    const bannerAddress = '0x9876543210987654321098765432109876543210'
    const targetAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

    describe('when the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          active: true,
          ownerAddress: bannerAddress,
          privacy: 'public',
          role: CommunityRole.Owner
        })
      })

      describe('and the user has permission to ban', () => {
        beforeEach(() => {
          mockCommunityRoles.validatePermissionToBanMemberFromCommunity.mockResolvedValue()
        })

        describe('and the target is a member of the community', () => {
          beforeEach(() => {
            mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(true)
            mockCommunitiesDB.kickMemberFromCommunity.mockResolvedValue()
            mockCommunitiesDB.banMemberFromCommunity.mockResolvedValue()
          })

          it('should kick and ban the member from the community', async () => {
            await communityBansComponent.banMember(communityId, bannerAddress, targetAddress)

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
            expect(mockCommunityRoles.validatePermissionToBanMemberFromCommunity).toHaveBeenCalledWith(
              communityId,
              bannerAddress,
              targetAddress
            )
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
            expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, targetAddress)
            expect(mockCommunitiesDB.banMemberFromCommunity).toHaveBeenCalledWith(communityId, bannerAddress, targetAddress)
          })

          it('should publish member status update to pubsub', async () => {
            await communityBansComponent.banMember(communityId, bannerAddress, targetAddress)

            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
              communityId,
              memberAddress: targetAddress,
              status: ConnectivityStatus.OFFLINE
            })
          })

          it('should publish SNS event for member ban', async () => {
            await communityBansComponent.banMember(communityId, bannerAddress, targetAddress)

            // Wait for setImmediate callback to execute
            await new Promise(resolve => setImmediate(resolve))
            expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
              type: Events.Type.COMMUNITY,
              subType: Events.SubType.Community.MEMBER_BANNED,
              key: expect.stringContaining(`${communityId}-${targetAddress}-`),
              timestamp: expect.any(Number),
              metadata: {
                id: communityId,
                name: 'Test Community',
                memberAddress: targetAddress
              }
            })
          })
        })

        describe('and the target is not a member of the community', () => {
          beforeEach(() => {
            mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(false)
            mockCommunitiesDB.banMemberFromCommunity.mockResolvedValue()
          })

          it('should ban the non-member without kicking them', async () => {
            await communityBansComponent.banMember(communityId, bannerAddress, targetAddress)

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
            expect(mockCommunityRoles.validatePermissionToBanMemberFromCommunity).toHaveBeenCalledWith(
              communityId,
              bannerAddress,
              targetAddress
            )
            expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
            expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.banMemberFromCommunity).toHaveBeenCalledWith(communityId, bannerAddress, targetAddress)
          })

          it('should publish member status update to pubsub', async () => {
            await communityBansComponent.banMember(communityId, bannerAddress, targetAddress)

            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
              communityId,
              memberAddress: targetAddress,
              status: ConnectivityStatus.OFFLINE
            })
          })

          it('should publish SNS event for member ban', async () => {
            await communityBansComponent.banMember(communityId, bannerAddress, targetAddress)

            // Wait for setImmediate callback to execute
            await new Promise(resolve => setImmediate(resolve))
            expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
              type: Events.Type.COMMUNITY,
              subType: Events.SubType.Community.MEMBER_BANNED,
              key: expect.stringContaining(`${communityId}-${targetAddress}-`),
              timestamp: expect.any(Number),
              metadata: {
                id: communityId,
                name: 'Test Community',
                memberAddress: targetAddress
              }
            })
          })
        })
      })

      describe('and the user does not have permission to ban', () => {
        beforeEach(() => {
          const permissionError = new NotAuthorizedError(
            `The user ${bannerAddress} doesn't have permission to ban ${targetAddress} from community ${communityId}`
          )
          mockCommunityRoles.validatePermissionToBanMemberFromCommunity.mockRejectedValue(permissionError)
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityBansComponent.banMember(communityId, bannerAddress, targetAddress)).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${bannerAddress} doesn't have permission to ban ${targetAddress} from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
          expect(mockCommunityRoles.validatePermissionToBanMemberFromCommunity).toHaveBeenCalledWith(
            communityId,
            bannerAddress,
            targetAddress
          )
          expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.banMemberFromCommunity).not.toHaveBeenCalled()
          expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
          expect(mockSns.publishMessage).not.toHaveBeenCalled()
        })
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityBansComponent.banMember(communityId, bannerAddress, targetAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToBanMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.banMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
        expect(mockSns.publishMessage).not.toHaveBeenCalled()
      })
    })
  })

  describe('unbanMember', () => {
    const unbannerAddress = '0x9876543210987654321098765432109876543210'
    const targetAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

    describe('when the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the user has permission to unban', () => {
        beforeEach(() => {
          mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity.mockResolvedValue()
        })

        describe('and the member is banned', () => {
          beforeEach(() => {
            mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)
            mockCommunitiesDB.unbanMemberFromCommunity.mockResolvedValue()
          })

          it('should unban the member', async () => {
            await communityBansComponent.unbanMember(communityId, unbannerAddress, targetAddress)

            expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
            expect(mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity).toHaveBeenCalledWith(
              communityId,
              unbannerAddress,
              targetAddress
            )
            expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(communityId, targetAddress)
            expect(mockCommunitiesDB.unbanMemberFromCommunity).toHaveBeenCalledWith(
              communityId,
              unbannerAddress,
              targetAddress
            )
          })
        })

        describe('and the member is not banned', () => {
          beforeEach(() => {
            mockCommunitiesDB.isMemberBanned.mockResolvedValue(false)
          })

          it('should return without unbanning', async () => {
            await communityBansComponent.unbanMember(communityId, unbannerAddress, targetAddress)

            expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
            expect(mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity).toHaveBeenCalledWith(
              communityId,
              unbannerAddress,
              targetAddress
            )
            expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(communityId, targetAddress)
            expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
          })
        })
      })

      describe('and the user does not have permission to unban', () => {
        beforeEach(() => {
          const permissionError = new NotAuthorizedError(
            `The user ${unbannerAddress} doesn't have permission to unban ${targetAddress} from community ${communityId}`
          )
          mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity.mockRejectedValue(permissionError)
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityBansComponent.unbanMember(communityId, unbannerAddress, targetAddress)).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${unbannerAddress} doesn't have permission to unban ${targetAddress} from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
          expect(mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity).toHaveBeenCalledWith(
            communityId,
            unbannerAddress,
            targetAddress
          )
          expect(mockCommunitiesDB.isMemberBanned).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
        })
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityBansComponent.unbanMember(communityId, unbannerAddress, targetAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.isMemberBanned).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
      })
    })
  })

  describe('getBannedMembers', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const pagination = { limit: 10, offset: 0 }
    const mockProfiles = [
      createMockProfile('0x1234567890123456789012345678901234567890'),
      createMockProfile('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    ]

    describe('when the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          active: true,
          ownerAddress: userAddress,
          privacy: 'public',
          role: CommunityRole.Owner
        })
      })

      describe('and the user has permission to get banned members', () => {
        beforeEach(() => {
          mockCommunityRoles.validatePermissionToGetBannedMembers.mockResolvedValue()
        })

        describe('and there are banned members', () => {
          beforeEach(() => {
            mockCommunitiesDB.getBannedMembers.mockResolvedValue(mockBannedMembers)
            mockCommunitiesDB.getBannedMembersCount.mockResolvedValue(2)
            mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
          })

          it('should return banned members with profiles', async () => {
            const result = await communityBansComponent.getBannedMembers(communityId, userAddress, pagination)

            expect(result).toEqual({
              members: expect.arrayContaining([
                expect.objectContaining({
                  memberAddress: mockBannedMembers[0].memberAddress,
                  bannedBy: mockBannedMembers[0].bannedBy,
                  bannedAt: mockBannedMembers[0].bannedAt,
                  name: 'Profile name 0x1234567890123456789012345678901234567890',
                  hasClaimedName: true,
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org')
                }),
                expect.objectContaining({
                  memberAddress: mockBannedMembers[1].memberAddress,
                  bannedBy: mockBannedMembers[1].bannedBy,
                  bannedAt: mockBannedMembers[1].bannedAt,
                  name: 'Profile name 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
                  hasClaimedName: true,
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org')
                })
              ]),
              totalMembers: 2
            })

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
            expect(mockCommunityRoles.validatePermissionToGetBannedMembers).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDB.getBannedMembers).toHaveBeenCalledWith(communityId, userAddress, pagination)
            expect(mockCommunitiesDB.getBannedMembersCount).toHaveBeenCalledWith(communityId)
            expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(
              mockBannedMembers.map((member) => member.memberAddress)
            )
          })

          it('should handle pagination correctly', async () => {
            const customPagination = { limit: 5, offset: 10 }
            mockCommunitiesDB.getBannedMembers.mockResolvedValue(mockBannedMembers.slice(0, 1))
            mockCommunitiesDB.getBannedMembersCount.mockResolvedValue(1)
            mockCatalystClient.getProfiles.mockResolvedValue([mockProfiles[0]])

            await communityBansComponent.getBannedMembers(communityId, userAddress, customPagination)

            expect(mockCommunitiesDB.getBannedMembers).toHaveBeenCalledWith(communityId, userAddress, customPagination)
          })
        })

        describe('and there are no banned members', () => {
          beforeEach(() => {
            mockCommunitiesDB.getBannedMembers.mockResolvedValue([])
            mockCommunitiesDB.getBannedMembersCount.mockResolvedValue(0)
            mockCatalystClient.getProfiles.mockResolvedValue([])
          })

          it('should return empty list', async () => {
            const result = await communityBansComponent.getBannedMembers(communityId, userAddress, pagination)

            expect(result).toEqual({
              members: [],
              totalMembers: 0
            })

            expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
          })
        })
      })

      describe('and the user does not have permission to get banned members', () => {
        beforeEach(() => {
          const permissionError = new NotAuthorizedError(
            `The user ${userAddress} doesn't have permission to get banned members from the community`
          )
          mockCommunityRoles.validatePermissionToGetBannedMembers.mockRejectedValue(permissionError)
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityBansComponent.getBannedMembers(communityId, userAddress, pagination)).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${userAddress} doesn't have permission to get banned members from the community`
            )
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
          expect(mockCommunityRoles.validatePermissionToGetBannedMembers).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.getBannedMembers).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.getBannedMembersCount).not.toHaveBeenCalled()
          expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
        })
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityBansComponent.getBannedMembers(communityId, userAddress, pagination)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToGetBannedMembers).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getBannedMembers).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getBannedMembersCount).not.toHaveBeenCalled()
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })
  })
})