import { CommunityRole } from '../../../src/types'
import { createCommunityRolesComponent, ROLE_ACTION_TRANSITIONS } from '../../../src/logic/community/roles'
import { OWNER_PERMISSIONS, MODERATOR_PERMISSIONS, COMMUNITY_ROLES } from '../../../src/logic/community/roles'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs } from '../../mocks/components/logs'
import { NotAuthorizedError } from '@dcl/platform-server-commons'

describe('Community Roles Component', () => {
  const roles = createCommunityRolesComponent({ communitiesDb: mockCommunitiesDB, logs: mockLogs })

  describe('ROLE_ACTION_TRANSITIONS', () => {
    it('should define correct transitions for each role', () => {
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.Owner]).toEqual([])
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.Moderator]).toEqual([CommunityRole.Owner])
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.Member]).toEqual([CommunityRole.Owner, CommunityRole.Moderator])
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.None]).toEqual([])
    })
  })

  describe('validatePermissionToKickMemberFromCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xOwner'
    const moderatorAddress = '0xModerator'
    const memberAddress = '0xMember'

    describe('when checking if owner can kick', () => {
      it('should allow owner to kick a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Member
        })
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, ownerAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should allow owner to kick a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [moderatorAddress]: CommunityRole.Moderator
        })
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow owner to kick another owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          ['0xother-owner']: CommunityRole.Owner
        })
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, ownerAddress, '0xother-owner')
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${ownerAddress} doesn't have permission to kick 0xother-owner from community ${communityId}`
          )
        )
      })
    })

    describe('when checking if moderator can kick', () => {
      it('should allow moderator to kick a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member
        })
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, moderatorAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow moderator to kick another moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          ['0xother-moderator']: CommunityRole.Moderator
        })
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, moderatorAddress, '0xother-moderator')
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to kick 0xother-moderator from community ${communityId}`
          )
        )
      })

      it('should not allow moderator to kick an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner
        })
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to kick ${ownerAddress} from community ${communityId}`
          )
        )
      })
    })

    describe('when checking if member can kick', () => {
      it('should not allow member to kick another member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          ['0xother-member']: CommunityRole.Member
        })
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, memberAddress, '0xother-member')
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to kick 0xother-member from community ${communityId}`
          )
        )
      })

      it('should not allow member to kick a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator
        })
        await expect(
          roles.validatePermissionToKickMemberFromCommunity(communityId, memberAddress, moderatorAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to kick ${moderatorAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow member to kick an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [ownerAddress]: CommunityRole.Owner
        })
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

  describe('validatePermissionToBanMemberFromCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'
    const nonMemberAddress = '0xnonmember'

    describe('when checking if owner can ban', () => {
      it('should allow owner to ban a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Member
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should allow owner to ban a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [moderatorAddress]: CommunityRole.Moderator
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow owner to ban another owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          ['0xother-owner']: CommunityRole.Owner
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, '0xother-owner')
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${ownerAddress} doesn't have permission to ban 0xother-owner from community ${communityId}`
          )
        )
      })

      it('should allow owner to ban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, nonMemberAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('when checking if moderator can ban', () => {
      it('should allow moderator to ban a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow moderator to ban another moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          ['0xother-moderator']: CommunityRole.Moderator
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, '0xother-moderator')
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to ban 0xother-moderator from community ${communityId}`
          )
        )
      })

      it('should not allow moderator to ban an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to ban ${ownerAddress} from community ${communityId}`
          )
        )
      })

      it('should allow moderator to ban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [nonMemberAddress]: CommunityRole.None
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, nonMemberAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('when checking if member can ban', () => {
      it('should not allow member to ban another member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          ['0xother-member']: CommunityRole.Member
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, '0xother-member')
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to ban 0xother-member from community ${communityId}`
          )
        )
      })

      it('should not allow member to ban a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, moderatorAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to ban ${moderatorAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow member to ban an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [ownerAddress]: CommunityRole.Owner
        })
        await expect(
          roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to ban ${ownerAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow member to ban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [nonMemberAddress]: CommunityRole.None
        })
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

  describe('validatePermissionToUnbanMemberFromCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'
    const nonMemberAddress = '0xnonmember'

    describe('when checking if owner can unban', () => {
      it('should allow owner to unban a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Member
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should allow owner to unban a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [moderatorAddress]: CommunityRole.Moderator
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow owner to unban another owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          ['0xother-owner']: CommunityRole.Owner
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, '0xother-owner')
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${ownerAddress} doesn't have permission to unban 0xother-owner from community ${communityId}`
          )
        )
      })

      it('should allow owner to unban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, nonMemberAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('when checking if moderator can unban', () => {
      it('should allow moderator to unban a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, memberAddress)
        ).resolves.not.toThrow()
      })

      it('should not allow moderator to unban another moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          ['0xother-moderator']: CommunityRole.Moderator
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, '0xother-moderator')
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to unban 0xother-moderator from community ${communityId}`
          )
        )
      })

      it('should not allow moderator to unban an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${moderatorAddress} doesn't have permission to unban ${ownerAddress} from community ${communityId}`
          )
        )
      })

      it('should allow moderator to unban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [nonMemberAddress]: CommunityRole.None
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, nonMemberAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('when checking if member can unban', () => {
      it('should not allow member to unban another member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          ['0xother-member']: CommunityRole.Member
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, '0xother-member')
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to unban 0xother-member from community ${communityId}`
          )
        )
      })

      it('should not allow member to unban a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, moderatorAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to unban ${moderatorAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow member to unban an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [ownerAddress]: CommunityRole.Owner
        })
        await expect(
          roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, ownerAddress)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to unban ${ownerAddress} from community ${communityId}`
          )
        )
      })

      it('should not allow member to unban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [nonMemberAddress]: CommunityRole.None
        })
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

  describe('validatePermissionToUpdateMemberRole', () => {
    describe('when trying to update own role', () => {
      it('should throw NotAuthorizedError', async () => {
        const communityId = 'community-1'
        const address = '0x123'
        const newRole = CommunityRole.Moderator

        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, address, address, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(`The user ${address} cannot update their own role in community ${communityId}`)
        )
      })
    })

    describe('when updater does not have assign_roles permission', () => {
      it('should throw NotAuthorizedError', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Member,
          [targetAddress]: CommunityRole.Member
        })

        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })

    describe('when trying to set role to Owner', () => {
      it('should throw NotAuthorizedError', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Owner

        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Moderator
        })

        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })

    describe('when updater cannot act on target member', () => {
      it('should throw NotAuthorizedError', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Owner
        })

        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })

    describe('when owner updates member roles', () => {
      it('should allow promoting a member to moderator', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Owner,
          [targetAddress]: CommunityRole.Member
        })

        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).resolves.not.toThrow()
      })

      it('should allow demoting a moderator to member', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Member

        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Owner,
          [targetAddress]: CommunityRole.Moderator
        })

        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).resolves.not.toThrow()
      })
    })

    describe('when moderator updates member roles', () => {
      it('should not allow promoting a member to moderator', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Member
        })

        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })

      it('should not allow demoting another moderator to member', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Member

        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Moderator
        })

        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })
  })

  describe('validatePermissionToAddPlacesToCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    it('should allow owner to add places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, ownerAddress)).resolves.not.toThrow()
    })

    it('should allow moderator to add places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, moderatorAddress)).resolves.not.toThrow()
    })

    it('should not allow member to add places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, memberAddress)).rejects.toThrow(
        new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to add places to the community`)
      )
    })

    it('should not allow non-member to add places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, '0xnonmember')).rejects.toThrow(
        new NotAuthorizedError(`The user 0xnonmember doesn't have permission to add places to the community`)
      )
    })
  })

  describe('validatePermissionToRemovePlacesFromCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    it('should allow owner to remove places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      await expect(
        roles.validatePermissionToRemovePlacesFromCommunity(communityId, ownerAddress)
      ).resolves.not.toThrow()
    })

    it('should allow moderator to remove places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      await expect(
        roles.validatePermissionToRemovePlacesFromCommunity(communityId, moderatorAddress)
      ).resolves.not.toThrow()
    })

    it('should not allow member to remove places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      await expect(roles.validatePermissionToRemovePlacesFromCommunity(communityId, memberAddress)).rejects.toThrow(
        new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to remove places from the community`)
      )
    })

    it('should not allow non-member to remove places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      await expect(roles.validatePermissionToRemovePlacesFromCommunity(communityId, '0xnonmember')).rejects.toThrow(
        new NotAuthorizedError(`The user 0xnonmember doesn't have permission to remove places from the community`)
      )
    })
  })

  describe('validatePermissionToUpdatePlaces', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    it('should allow owner to update places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      await expect(roles.validatePermissionToUpdatePlaces(communityId, ownerAddress)).resolves.not.toThrow()
    })

    it('should allow moderator to update places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      await expect(roles.validatePermissionToUpdatePlaces(communityId, moderatorAddress)).resolves.not.toThrow()
    })

    it('should not allow member to update places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      await expect(roles.validatePermissionToUpdatePlaces(communityId, memberAddress)).rejects.toThrow(
        new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to update places in the community`)
      )
    })

    it('should not allow non-member to update places', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      await expect(roles.validatePermissionToUpdatePlaces(communityId, '0xnonmember')).rejects.toThrow(
        new NotAuthorizedError(`The user 0xnonmember doesn't have permission to update places in the community`)
      )
    })
  })

  describe('validatePermissionToEditCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    it('should allow owner to edit community', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      await expect(roles.validatePermissionToEditCommunity(communityId, ownerAddress)).resolves.not.toThrow()
    })

    it('should allow moderator to edit community', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      await expect(roles.validatePermissionToEditCommunity(communityId, moderatorAddress)).resolves.not.toThrow()
    })

    it('should not allow member to edit community', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      await expect(roles.validatePermissionToEditCommunity(communityId, memberAddress)).rejects.toThrow(
        new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to edit the community`)
      )
    })

    it('should not allow non-member to edit community', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      await expect(roles.validatePermissionToEditCommunity(communityId, '0xnonmember')).rejects.toThrow(
        new NotAuthorizedError(`The user 0xnonmember doesn't have permission to edit the community`)
      )
    })
  })

  describe('validatePermissionToDeleteCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    it('should allow owner to delete community', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      await expect(roles.validatePermissionToDeleteCommunity(communityId, ownerAddress)).resolves.not.toThrow()
    })

    it('should not allow moderator to delete community', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      await expect(roles.validatePermissionToDeleteCommunity(communityId, moderatorAddress)).rejects.toThrow(
        new NotAuthorizedError(`The user ${moderatorAddress} doesn't have permission to delete the community`)
      )
    })

    it('should not allow member to delete community', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      await expect(roles.validatePermissionToDeleteCommunity(communityId, memberAddress)).rejects.toThrow(
        new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to delete the community`)
      )
    })

    it('should not allow non-member to delete community', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      await expect(roles.validatePermissionToDeleteCommunity(communityId, '0xnonmember')).rejects.toThrow(
        new NotAuthorizedError(`The user 0xnonmember doesn't have permission to delete the community`)
      )
    })
  })

  describe('validatePermissionToGetBannedMembers', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    it('should allow owner to get banned members', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      await expect(roles.validatePermissionToGetBannedMembers(communityId, ownerAddress)).resolves.not.toThrow()
    })

    it('should allow moderator to get banned members', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      await expect(roles.validatePermissionToGetBannedMembers(communityId, moderatorAddress)).resolves.not.toThrow()
    })

    it('should not allow member to get banned members', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      await expect(roles.validatePermissionToGetBannedMembers(communityId, memberAddress)).rejects.toThrow(
        new NotAuthorizedError(
          `The user ${memberAddress} doesn't have permission to get banned members from the community`
        )
      )
    })

    it('should not allow non-member to get banned members', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      await expect(roles.validatePermissionToGetBannedMembers(communityId, '0xnonmember')).rejects.toThrow(
        new NotAuthorizedError(`The user 0xnonmember doesn't have permission to get banned members from the community`)
      )
    })
  })
})
