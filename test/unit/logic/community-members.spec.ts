import { CommunityRole } from '../../../src/types'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs, mockCatalystClient, createMockPeersStatsComponent } from '../../mocks/components'
import { createCommunityMembersComponent } from '../../../src/logic/community/members'
import { ICommunityMembersComponent, ICommunityRolesComponent } from '../../../src/logic/community/types'
import { createMockCommunityRolesComponent } from '../../mocks/community'
import { createMockProfile } from '../../mocks/profile'
import { CommunityMember, CommunityMemberProfile } from '../../../src/logic/community/types'
import { IPeersStatsComponent } from '../../../src/logic/peers-stats'

describe('Community Members Component', () => {
  let communityMembersComponent: ICommunityMembersComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockUserAddress: string
  let mockPeersStats: jest.Mocked<IPeersStatsComponent>

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
    mockPeersStats = createMockPeersStatsComponent()
    communityMembersComponent = await createCommunityMembersComponent({
      communitiesDb: mockCommunitiesDB,
      catalystClient: mockCatalystClient,
      communityRoles: mockCommunityRoles,
      logs: mockLogs,
      peersStats: mockPeersStats
    })
  })

  describe('getCommunityMembers', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const options = { pagination: { limit: 10, offset: 0 }, onlyOnline: false }
    const mockProfiles = [
      createMockProfile('0x1234567890123456789012345678901234567890'),
      createMockProfile('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    ]

    describe('when all validations pass for public community', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          privacy: 'public',
          active: true,
          ownerAddress: '0xowner',
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityMembers.mockResolvedValueOnce(mockCommunityMembers)
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValueOnce(2)
        mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)
      })

      it('should return community members with profiles', async () => {
        const result = await communityMembersComponent.getCommunityMembers(communityId, userAddress, options)

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

    describe('when all validations pass for private community with member access', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          privacy: 'private',
          active: true,
          ownerAddress: '0xowner',
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Member)
        mockCommunitiesDB.getCommunityMembers.mockResolvedValueOnce(mockCommunityMembers)
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValueOnce(2)
        mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)
      })

      it('should return community members with profiles', async () => {
        const result = await communityMembersComponent.getCommunityMembers(communityId, userAddress, options)

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

    describe('when only online members are requested', () => {
      const onlineOptions = { pagination: { limit: 10, offset: 0 }, onlyOnline: true }
      const onlinePeers = ['0x1234567890123456789012345678901234567890']

      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          privacy: 'public',
          active: true,
          ownerAddress: '0xowner',
          role: CommunityRole.Member
        })
        mockPeersStats.getConnectedPeers.mockResolvedValueOnce(onlinePeers)
        mockCommunitiesDB.getCommunityMembers.mockResolvedValueOnce(mockCommunityMembers.slice(0, 1))
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValueOnce(1)
        mockCatalystClient.getProfiles.mockResolvedValueOnce([mockProfiles[0]])
      })

      it('should filter by online peers', async () => {
        await communityMembersComponent.getCommunityMembers(communityId, userAddress, onlineOptions)

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

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityMembersComponent.getCommunityMembers(communityId, userAddress, options)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunityMembers).not.toHaveBeenCalled()
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('when the community is private and user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          privacy: 'private',
          active: true,
          ownerAddress: '0xowner',
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.None)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityMembersComponent.getCommunityMembers(communityId, userAddress, options)).rejects.toThrow(
          new NotAuthorizedError("The user doesn't have permission to get community members")
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.getCommunityMembers).not.toHaveBeenCalled()
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })
  })

  describe('getMembersFromPublicCommunity', () => {
    const options = { pagination: { limit: 10, offset: 0 }, onlyOnline: false }
    const mockProfiles = [
      createMockProfile('0x1234567890123456789012345678901234567890'),
      createMockProfile('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    ]

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          privacy: 'public',
          active: true,
          ownerAddress: '0xowner',
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityMembers.mockResolvedValueOnce(mockCommunityMembers)
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValueOnce(2)
        mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)
      })

      it('should return community members with profiles', async () => {
        const result = await communityMembersComponent.getMembersFromPublicCommunity(communityId, options)

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

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityMembersComponent.getMembersFromPublicCommunity(communityId, options)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: true })
        expect(mockCommunitiesDB.getCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunityMembers).not.toHaveBeenCalled()
      })
    })
  })

  describe('kickMember', () => {
    const kickerAddress = '0x9876543210987654321098765432109876543210'
    const targetAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToKickMemberFromCommunity.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.kickMemberFromCommunity.mockResolvedValueOnce()
      })

      it('should kick the member from the community', async () => {
        await communityMembersComponent.kickMember(communityId, kickerAddress, targetAddress)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
        expect(mockCommunityRoles.validatePermissionToKickMemberFromCommunity).toHaveBeenCalledWith(
          communityId,
          kickerAddress,
          targetAddress
        )
        expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, targetAddress)
      })
    })

    describe('when the target is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(false)
      })

      it('should return without kicking', async () => {
        await communityMembersComponent.kickMember(communityId, kickerAddress, targetAddress)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
        expect(mockCommunityRoles.validatePermissionToKickMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityMembersComponent.kickMember(communityId, kickerAddress, targetAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunityRoles.validatePermissionToKickMemberFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${kickerAddress} doesn't have permission to kick ${targetAddress} from community ${communityId}`
        )
        mockCommunityRoles.validatePermissionToKickMemberFromCommunity.mockRejectedValue(permissionError)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityMembersComponent.kickMember(communityId, kickerAddress, targetAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${kickerAddress} doesn't have permission to kick ${targetAddress} from community ${communityId}`
          )
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, targetAddress)
        expect(mockCommunityRoles.validatePermissionToKickMemberFromCommunity).toHaveBeenCalledWith(
          communityId,
          kickerAddress,
          targetAddress
        )
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
      })
    })
  })

  describe('joinCommunity', () => {
    const memberAddress = '0x1234567890123456789012345678901234567890'

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(false)
        mockCommunitiesDB.isMemberBanned.mockResolvedValueOnce(false)
        mockCommunitiesDB.addCommunityMember.mockResolvedValueOnce()
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
      })
    })

    describe('when the user is already a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(true)
      })

      it('should return without adding', async () => {
        await communityMembersComponent.joinCommunity(communityId, memberAddress)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
        expect(mockCommunitiesDB.isMemberBanned).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
      })
    })

    describe('when the user is banned', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(false)
        mockCommunitiesDB.isMemberBanned.mockResolvedValueOnce(true)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityMembersComponent.joinCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${memberAddress} is banned from community ${communityId}`)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
        expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(communityId, memberAddress)
        expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityMembersComponent.joinCommunity(communityId, memberAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.isMemberBanned).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
      })
    })
  })

  describe('leaveCommunity', () => {
    const memberAddress = '0x1234567890123456789012345678901234567890'

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToLeaveCommunity.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.kickMemberFromCommunity.mockResolvedValueOnce()
      })

      it('should remove the member from the community', async () => {
        await communityMembersComponent.leaveCommunity(communityId, memberAddress)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
        expect(mockCommunityRoles.validatePermissionToLeaveCommunity).toHaveBeenCalledWith(communityId, memberAddress)
        expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, memberAddress)
      })
    })

    describe('when the user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(false)
      })

      it('should return without removing', async () => {
        await communityMembersComponent.leaveCommunity(communityId, memberAddress)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
        expect(mockCommunityRoles.validatePermissionToLeaveCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityMembersComponent.leaveCommunity(communityId, memberAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).not.toHaveBeenCalled()
        expect(mockCommunityRoles.validatePermissionToLeaveCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(`The owner cannot leave the community ${communityId}`)
        mockCommunityRoles.validatePermissionToLeaveCommunity.mockRejectedValue(permissionError)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityMembersComponent.leaveCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The owner cannot leave the community ${communityId}`)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.isMemberOfCommunity).toHaveBeenCalledWith(communityId, memberAddress)
        expect(mockCommunityRoles.validatePermissionToLeaveCommunity).toHaveBeenCalledWith(communityId, memberAddress)
        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
      })
    })
  })

  describe('updateMemberRole', () => {
    const updaterAddress = '0x9876543210987654321098765432109876543210'
    const targetAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    const newRole = CommunityRole.Moderator

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToUpdateMemberRole.mockResolvedValueOnce(undefined)
        mockCommunitiesDB.updateMemberRole.mockResolvedValueOnce()
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

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
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

    describe('when the user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
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
})
