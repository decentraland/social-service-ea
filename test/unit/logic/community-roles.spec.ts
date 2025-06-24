import { CommunityRole } from '../../../src/types'
import { createCommunityRolesComponent, ROLE_ACTION_TRANSITIONS } from '../../../src/logic/community/roles'
import { OWNER_PERMISSIONS, MODERATOR_PERMISSIONS, COMMUNITY_ROLES } from '../../../src/logic/community/roles'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs } from '../../mocks/components/logs'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { ICommunityRolesComponent } from '../../../src/logic/community'

describe('Community Roles Component', () => {
  let roles: ICommunityRolesComponent

  const communityId = 'test-community'
  const ownerAddress = '0xOwner'
  const moderatorAddress = '0xModerator'
  const memberAddress = '0xMember'
  const anotherOwnerAddress = '0xAnotherOwner'
  const anotherModeratorAddress = '0xAnotherModerator'
  const anotherMemberAddress = '0xAnotherMember'
  const nonMemberAddress = '0xNonMember'

  beforeEach(() => {
    roles = createCommunityRolesComponent({ communitiesDb: mockCommunitiesDB, logs: mockLogs })

    // Reset all mocks
    jest.clearAllMocks()
  })

  describe('ROLE_ACTION_TRANSITIONS', () => {
    it('should define correct transitions for each role', () => {
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.Owner]).toEqual([])
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.Moderator]).toEqual([CommunityRole.Owner])
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.Member]).toEqual([CommunityRole.Owner, CommunityRole.Moderator])
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.None]).toEqual([])
    })
  })

  describe('when validating permission to kick a member from a community', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator,
          [anotherOwnerAddress]: CommunityRole.Owner
        })
      })

      it('should allow to kick a member', async () => {
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, ownerAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should allow to kick a moderator', async () => {
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow to kick another owner throwing a NotAuthorizedError', async () => {
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, ownerAddress, anotherOwnerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${ownerAddress} doesn't have permission to kick ${anotherOwnerAddress} from community ${communityId}`
          )
        )
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member,
          [anotherModeratorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner
        })
      })

      it('should allow to kick a member', async () => {
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, moderatorAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow to kick another moderator', async () => {
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, moderatorAddress, anotherModeratorAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to kick ${anotherModeratorAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to kick an owner', async () => {
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to kick ${ownerAddress} from community ${communityId}`
          )
        )
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [anotherMemberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner
        })
      })

      it('should not allow to kick another member', async () => {
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, memberAddress, anotherMemberAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to kick ${anotherMemberAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to kick a moderator', async () => {
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, memberAddress, moderatorAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to kick ${moderatorAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to kick an owner', async () => {
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, memberAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to kick ${ownerAddress} from community ${communityId}`
          )
        )
      })
    })
  })

  describe('when validating permission to ban a member from a community', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator,
          [anotherOwnerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
      })

      it('should allow to ban a member', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should allow to ban a moderator', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow to ban another owner', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, anotherOwnerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${ownerAddress} doesn't have permission to ban ${anotherOwnerAddress} from community ${communityId}`
          )
        )
      })

      it('should allow to ban a non-member', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, nonMemberAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member,
          [anotherModeratorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
      })

      it('should allow to ban a member', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow to ban another moderator', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, anotherModeratorAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to ban ${anotherModeratorAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to ban an owner', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to ban ${ownerAddress} from community ${communityId}`
          )
        )
      })

      it('should allow to ban a non-member', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, nonMemberAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [anotherMemberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
      })

      it('should not allow to ban another member', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, anotherMemberAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to ban ${anotherMemberAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to ban a moderator', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, moderatorAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to ban ${moderatorAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to ban an owner', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to ban ${ownerAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to ban a non-member', async () => {
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, nonMemberAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to ban ${nonMemberAddress} from community ${communityId}`
          )
        )
      })
    })
  })

  describe('when validating permission to unban a member from a community', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator,
          [anotherOwnerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
      })

      it('should allow to unban a member', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should allow to unban a moderator', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow to unban another owner', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, anotherOwnerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${ownerAddress} doesn't have permission to unban ${anotherOwnerAddress} from community ${communityId}`
          )
        )
      })

      it('should allow to unban a non-member', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, nonMemberAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member,
          [anotherModeratorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
      })

      it('should allow to unban a member', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow to unban another moderator', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, anotherModeratorAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to unban ${anotherModeratorAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to unban an owner', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to unban ${ownerAddress} from community ${communityId}`
          )
        )
      })

      it('should allow to unban a non-member', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, nonMemberAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [anotherMemberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
      })

      it('should not allow to unban another member', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, anotherMemberAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to unban ${anotherMemberAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to unban a moderator', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, moderatorAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to unban ${moderatorAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to unban an owner', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to unban ${ownerAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow to unban a non-member', async () => {
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, nonMemberAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to unban ${nonMemberAddress} from community ${communityId}`
          )
        )
      })
    })
  })

  describe('when validating permission to update a member role', () => {
    describe('and the user tries to update their own role', () => {
      const address = '0x123'
      const newRole = CommunityRole.Moderator

      it('should throw NotAuthorizedError preventing self-role updates', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, address, address, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(`The user ${address} cannot update their own role in community ${communityId}`)
        )
      })
    })

    describe('and the updater does not have assign_roles permission', () => {
      const updaterAddress = '0x123'
      const targetAddress = '0x456'
      const newRole = CommunityRole.Moderator

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Member,
          [targetAddress]: CommunityRole.Member
        })
      })

      it('should throw NotAuthorizedError due to insufficient permissions', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })

    describe('and the user tries to set role to Owner', () => {
      const updaterAddress = '0x123'
      const targetAddress = '0x456'
      const newRole = CommunityRole.Owner

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Moderator
        })
      })

      it('should throw NotAuthorizedError as Owner role assignment is restricted', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })

    describe('and the updater cannot act on target member', () => {
      const updaterAddress = '0x123'
      const targetAddress = '0x456'
      const newRole = CommunityRole.Moderator

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Owner
        })
      })

      it('should throw NotAuthorizedError due to insufficient authority over target', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })

    describe('and the user is an owner', () => {
      const updaterAddress = '0x123'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator
        })
      })

      it('should allow to promote a member to moderator', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(
            communityId,
            updaterAddress,
            memberAddress,
            CommunityRole.Moderator
          )
        ).resolves.not.toThrow()
      })

      it('should allow to demote a moderator to member', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(
            communityId,
            updaterAddress,
            moderatorAddress,
            CommunityRole.Member
          )
        ).resolves.not.toThrow()
      })
    })

    describe('and the user is a moderator', () => {
      const updaterAddress = '0x123'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member,
          [anotherModeratorAddress]: CommunityRole.Moderator
        })
      })

      it('should not allow to promote a member to moderator due to insufficient permissions', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(
            communityId,
            updaterAddress,
            memberAddress,
            CommunityRole.Moderator
          )
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })

      it('should not allow to demote another moderator to member due to insufficient permissions', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(
            communityId,
            updaterAddress,
            anotherModeratorAddress,
            CommunityRole.Member
          )
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })
  })

  describe('when validating permission to add places to a community', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action as owners have full permissions', async () => {
        await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action as moderators have place management permissions', async () => {
        await expect(
          roles.validatePermissionToAddPlacesToCommunity(communityId, moderatorAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError as members lack place management permissions', async () => {
        await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to add places to the community`)
        )
      })
    })

    describe('and the user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError as non-members have no permissions', async () => {
        await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${nonMemberAddress} doesn't have permission to add places to the community`)
        )
      })
    })
  })

  describe('when validating permission to remove places from a community', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action as owners have full permissions', async () => {
        await expect(
          roles.validatePermissionToRemovePlacesFromCommunity(communityId, ownerAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action as moderators have place management permissions', async () => {
        await expect(
          roles.validatePermissionToRemovePlacesFromCommunity(communityId, moderatorAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError as members lack place management permissions', async () => {
        await expect(roles.validatePermissionToRemovePlacesFromCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to remove places from the community`
          )
        )
      })
    })

    describe('and the user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError as non-members have no permissions', async () => {
        await expect(
          roles.validatePermissionToRemovePlacesFromCommunity(communityId, nonMemberAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${nonMemberAddress} doesn't have permission to remove places from the community`
          )
        )
      })
    })
  })

  describe('when validating permission to update places in a community', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action as owners have full permissions', async () => {
        await expect(roles.validatePermissionToUpdatePlaces(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action as moderators have place management permissions', async () => {
        await expect(roles.validatePermissionToUpdatePlaces(communityId, moderatorAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError as members lack place management permissions', async () => {
        await expect(roles.validatePermissionToUpdatePlaces(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to update places in the community`)
        )
      })
    })

    describe('and the user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError as non-members have no permissions', async () => {
        await expect(roles.validatePermissionToUpdatePlaces(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${nonMemberAddress} doesn't have permission to update places in the community`
          )
        )
      })
    })
  })

  describe('when validating permission to edit a community', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action as owners have full permissions', async () => {
        await expect(roles.validatePermissionToEditCommunity(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action as moderators have community editing permissions', async () => {
        await expect(roles.validatePermissionToEditCommunity(communityId, moderatorAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError as members lack community editing permissions', async () => {
        await expect(roles.validatePermissionToEditCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to edit the community`)
        )
      })
    })

    describe('and the user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError as non-members have no permissions', async () => {
        await expect(roles.validatePermissionToEditCommunity(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${nonMemberAddress} doesn't have permission to edit the community`)
        )
      })
    })
  })

  describe('when validating permission to delete a community', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action as only owners can delete communities', async () => {
        await expect(roles.validatePermissionToDeleteCommunity(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should throw NotAuthorizedError as moderators cannot delete communities', async () => {
        await expect(roles.validatePermissionToDeleteCommunity(communityId, moderatorAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${moderatorAddress} doesn't have permission to delete the community`)
        )
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError as members cannot delete communities', async () => {
        await expect(roles.validatePermissionToDeleteCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to delete the community`)
        )
      })
    })

    describe('and the user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError as non-members cannot delete communities', async () => {
        await expect(roles.validatePermissionToDeleteCommunity(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${nonMemberAddress} doesn't have permission to delete the community`)
        )
      })
    })
  })

  describe('when validating permission to get banned members', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action as owners have full permissions', async () => {
        await expect(roles.validatePermissionToGetBannedMembers(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action as moderators have ban management permissions', async () => {
        await expect(roles.validatePermissionToGetBannedMembers(communityId, moderatorAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError as members lack ban management permissions', async () => {
        await expect(roles.validatePermissionToGetBannedMembers(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to get banned members from the community`
          )
        )
      })
    })

    describe('and the user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError as non-members have no permissions', async () => {
        await expect(roles.validatePermissionToGetBannedMembers(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${nonMemberAddress} doesn't have permission to get banned members from the community`
          )
        )
      })
    })
  })

  describe('when validating permission to leave a community', () => {
    describe('and the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should throw NotAuthorizedError as owners cannot leave their communities', async () => {
        await expect(roles.validatePermissionToLeaveCommunity(communityId, ownerAddress)).rejects.toThrow(
          new NotAuthorizedError(`The owner cannot leave the community ${communityId}`)
        )
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action as moderators can leave communities', async () => {
        await expect(roles.validatePermissionToLeaveCommunity(communityId, moderatorAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should allow the action as members can leave communities', async () => {
        await expect(roles.validatePermissionToLeaveCommunity(communityId, memberAddress)).resolves.not.toThrow()
      })
    })

    describe('and the user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should allow the action as non-members can leave communities', async () => {
        await expect(roles.validatePermissionToLeaveCommunity(communityId, nonMemberAddress)).resolves.not.toThrow()
      })
    })
  })
})
