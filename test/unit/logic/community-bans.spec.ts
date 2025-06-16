import { CommunityRole } from '../../../src/types'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs, mockCatalystClient } from '../../mocks/components'
import { createCommunityBansComponent } from '../../../src/logic/community/bans'
import { createCommunityRolesComponent } from '../../../src/logic/community/roles'
import { ICommunityBansComponent } from '../../../src/logic/community'
import { BannedMember, BannedMemberProfile, ICommunityRolesComponent } from '../../../src/logic/community/types'
import { createMockCommunityRolesComponent } from '../../mocks/communities'
import { createMockProfile } from '../../mocks/profile'

describe('Community Bans Component', () => {
  let communityBansComponent: ICommunityBansComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
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
    communityBansComponent = await createCommunityBansComponent({
      communitiesDb: mockCommunitiesDB,
      catalystClient: mockCatalystClient,
      communityRoles: mockCommunityRoles,
      logs: mockLogs
    })
  })

  describe('banMember', () => {
    const bannerAddress = '0x9876543210987654321098765432109876543210'
    const targetAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

    describe('when all validations pass', () => {
      it('should ban a member who belongs to the community', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToBanMemberFromCommunity.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(true)
        mockCommunitiesDB.kickMemberFromCommunity.mockResolvedValueOnce()
        mockCommunitiesDB.banMemberFromCommunity.mockResolvedValueOnce()

        await communityBansComponent.banMember(communityId, bannerAddress, targetAddress)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToBanMemberFromCommunity).toHaveBeenCalledWith(
          communityId,
          bannerAddress,
          targetAddress
        )
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
        expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, targetAddress)
        expect(mockCommunitiesDB.banMemberFromCommunity).toHaveBeenCalledWith(communityId, bannerAddress, targetAddress)
      })

      it('should ban a non-member without kicking them', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToBanMemberFromCommunity.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(false)
        mockCommunitiesDB.banMemberFromCommunity.mockResolvedValueOnce()

        await communityBansComponent.banMember(communityId, bannerAddress, targetAddress)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToBanMemberFromCommunity).toHaveBeenCalledWith(
          communityId,
          bannerAddress,
          targetAddress
        )
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.banMemberFromCommunity).toHaveBeenCalledWith(communityId, bannerAddress, targetAddress)
      })
    })

    describe('when the community does not exist', () => {
      it('should throw CommunityNotFoundError', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)

        await expect(communityBansComponent.banMember(communityId, bannerAddress, targetAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToBanMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.banMemberFromCommunity).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not have permission', () => {
      it('should throw NotAuthorizedError', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${bannerAddress} doesn't have permission to ban ${targetAddress} from community ${communityId}`
        )
        mockCommunityRoles.validatePermissionToBanMemberFromCommunity.mockRejectedValue(permissionError)

        await expect(communityBansComponent.banMember(communityId, bannerAddress, targetAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${bannerAddress} doesn't have permission to ban ${targetAddress} from community ${communityId}`
          )
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToBanMemberFromCommunity).toHaveBeenCalledWith(
          communityId,
          bannerAddress,
          targetAddress
        )
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.banMemberFromCommunity).not.toHaveBeenCalled()
      })
    })
  })

  describe('unbanMember', () => {
    const unbannerAddress = '0x9876543210987654321098765432109876543210'
    const targetAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

    describe('when all validations pass and member is banned', () => {
      it('should unban the member', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.isMemberBanned.mockResolvedValueOnce(true)
        mockCommunitiesDB.unbanMemberFromCommunity.mockResolvedValueOnce()

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

    describe('when the member is not banned', () => {
      it('should return without unbanning', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.isMemberBanned.mockResolvedValueOnce(false)

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

    describe('when the community does not exist', () => {
      it('should throw CommunityNotFoundError', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)

        await expect(communityBansComponent.unbanMember(communityId, unbannerAddress, targetAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.isMemberBanned).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not have permission', () => {
      it('should throw NotAuthorizedError', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${unbannerAddress} doesn't have permission to unban ${targetAddress} from community ${communityId}`
        )
        mockCommunityRoles.validatePermissionToUnbanMemberFromCommunity.mockRejectedValue(permissionError)

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

  describe('getBannedMembers', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const pagination = { limit: 10, offset: 0 }
    const mockProfiles = [
      createMockProfile('0x1234567890123456789012345678901234567890'),
      createMockProfile('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    ]

    describe('when all validations pass', () => {
      it('should return banned members with profiles', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToGetBannedMembers.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.getBannedMembers.mockResolvedValueOnce(mockBannedMembers)
        mockCommunitiesDB.getBannedMembersCount.mockResolvedValueOnce(2)
        mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

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

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToGetBannedMembers).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.getBannedMembers).toHaveBeenCalledWith(communityId, userAddress, pagination)
        expect(mockCommunitiesDB.getBannedMembersCount).toHaveBeenCalledWith(communityId)
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(
          mockBannedMembers.map((member) => member.memberAddress)
        )
      })

      it('should handle pagination correctly', async () => {
        const customPagination = { limit: 5, offset: 10 }
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToGetBannedMembers.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.getBannedMembers.mockResolvedValueOnce(mockBannedMembers.slice(0, 1))
        mockCommunitiesDB.getBannedMembersCount.mockResolvedValueOnce(1)
        mockCatalystClient.getProfiles.mockResolvedValueOnce([mockProfiles[0]])

        await communityBansComponent.getBannedMembers(communityId, userAddress, customPagination)

        expect(mockCommunitiesDB.getBannedMembers).toHaveBeenCalledWith(communityId, userAddress, customPagination)
      })

      it('should handle empty banned members list', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToGetBannedMembers.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.getBannedMembers.mockResolvedValueOnce([])
        mockCommunitiesDB.getBannedMembersCount.mockResolvedValueOnce(0)
        mockCatalystClient.getProfiles.mockResolvedValueOnce([])

        const result = await communityBansComponent.getBannedMembers(communityId, userAddress, pagination)

        expect(result).toEqual({
          members: [],
          totalMembers: 0
        })

        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
      })
    })

    describe('when the community does not exist', () => {
      it('should throw CommunityNotFoundError', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)

        await expect(communityBansComponent.getBannedMembers(communityId, userAddress, pagination)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToGetBannedMembers).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getBannedMembers).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getBannedMembersCount).not.toHaveBeenCalled()
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not have permission', () => {
      it('should throw NotAuthorizedError', async () => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${userAddress} doesn't have permission to get banned members from the community`
        )
        mockCommunityRoles.validatePermissionToGetBannedMembers.mockRejectedValue(permissionError)

        await expect(communityBansComponent.getBannedMembers(communityId, userAddress, pagination)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${userAddress} doesn't have permission to get banned members from the community`
          )
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToGetBannedMembers).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.getBannedMembers).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getBannedMembersCount).not.toHaveBeenCalled()
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })
  })
})
