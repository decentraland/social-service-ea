import { CommunityRole } from '../../../src/types'
import { createCommunityRolesComponent, ROLE_ACTION_TRANSITIONS } from '../../../src/logic/community/roles'
import { OWNER_PERMISSIONS, MODERATOR_PERMISSIONS, COMMUNITY_ROLES } from '../../../src/logic/community/roles'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs } from '../../mocks/components/logs'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { ICommunityRolesComponent } from '../../../src/logic/community'

describe('Community Roles Component', () => {
  let roles: ICommunityRolesComponent

  beforeEach(() => {
    roles = createCommunityRolesComponent({ communitiesDb: mockCommunitiesDB, logs: mockLogs })
  })

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

    describe('when the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner
        })
      })

      describe('and tries to kick a member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToKickMemberFromCommunity(communityId, ownerAddress, memberAddress)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to kick a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [moderatorAddress]: CommunityRole.Moderator
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToKickMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to kick another owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            ['0xother-owner']: CommunityRole.Owner
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToKickMemberFromCommunity(communityId, ownerAddress, '0xother-owner')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${ownerAddress} doesn't have permission to kick 0xother-owner from community ${communityId}`
            )
          )
        })
      })
    })

    describe('when the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator
        })
      })

      describe('and tries to kick a member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToKickMemberFromCommunity(communityId, moderatorAddress, memberAddress)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to kick another moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            ['0xother-moderator']: CommunityRole.Moderator
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToKickMemberFromCommunity(communityId, moderatorAddress, '0xother-moderator')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to kick 0xother-moderator from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to kick an owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [ownerAddress]: CommunityRole.Owner
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToKickMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to kick ${ownerAddress} from community ${communityId}`
            )
          )
        })
      })
    })

    describe('when the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member
        })
      })

      describe('and tries to kick another member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            ['0xother-member']: CommunityRole.Member
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToKickMemberFromCommunity(communityId, memberAddress, '0xother-member')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to kick 0xother-member from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to kick a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            [moderatorAddress]: CommunityRole.Moderator
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToKickMemberFromCommunity(communityId, memberAddress, moderatorAddress)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to kick ${moderatorAddress} from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to kick an owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            [ownerAddress]: CommunityRole.Owner
          })
        })

        it('should throw NotAuthorizedError', async () => {
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
  })

  describe('validatePermissionToBanMemberFromCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'
    const nonMemberAddress = '0xnonmember'

    describe('when the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner
        })
      })

      describe('and tries to ban a member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, memberAddress)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to ban a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [moderatorAddress]: CommunityRole.Moderator
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to ban another owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            ['0xother-owner']: CommunityRole.Owner
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, '0xother-owner')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${ownerAddress} doesn't have permission to ban 0xother-owner from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to ban a non-member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [nonMemberAddress]: CommunityRole.None
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, ownerAddress, nonMemberAddress)
          ).resolves.not.toThrow()
        })
      })
    })

    describe('when the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator
        })
      })

      describe('and tries to ban a member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, memberAddress)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to ban another moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            ['0xother-moderator']: CommunityRole.Moderator
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, '0xother-moderator')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to ban 0xother-moderator from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to ban an owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [ownerAddress]: CommunityRole.Owner
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to ban ${ownerAddress} from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to ban a non-member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [nonMemberAddress]: CommunityRole.None
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, moderatorAddress, nonMemberAddress)
          ).resolves.not.toThrow()
        })
      })
    })

    describe('when the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member
        })
      })

      describe('and tries to ban another member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            ['0xother-member']: CommunityRole.Member
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, '0xother-member')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to ban 0xother-member from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to ban a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            [moderatorAddress]: CommunityRole.Moderator
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, moderatorAddress)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to ban ${moderatorAddress} from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to ban an owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            [ownerAddress]: CommunityRole.Owner
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToBanMemberFromCommunity(communityId, memberAddress, ownerAddress)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to ban ${ownerAddress} from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to ban a non-member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            [nonMemberAddress]: CommunityRole.None
          })
        })

        it('should throw NotAuthorizedError', async () => {
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
  })

  describe('validatePermissionToUnbanMemberFromCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'
    const nonMemberAddress = '0xnonmember'

    describe('when the user is an owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner
        })
      })

      describe('and tries to unban a member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, memberAddress)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to unban a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [moderatorAddress]: CommunityRole.Moderator
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to unban another owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            ['0xother-owner']: CommunityRole.Owner
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, '0xother-owner')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${ownerAddress} doesn't have permission to unban 0xother-owner from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to unban a non-member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [nonMemberAddress]: CommunityRole.None
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, ownerAddress, nonMemberAddress)
          ).resolves.not.toThrow()
        })
      })
    })

    describe('when the user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator
        })
      })

      describe('and tries to unban a member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, memberAddress)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to unban another moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            ['0xother-moderator']: CommunityRole.Moderator
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, '0xother-moderator')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to unban 0xother-moderator from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to unban an owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [ownerAddress]: CommunityRole.Owner
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to unban ${ownerAddress} from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to unban a non-member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [nonMemberAddress]: CommunityRole.None
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, moderatorAddress, nonMemberAddress)
          ).resolves.not.toThrow()
        })
      })
    })

    describe('when the user is a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member
        })
      })

      describe('and tries to unban another member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            ['0xother-member']: CommunityRole.Member
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, '0xother-member')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to unban 0xother-member from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to unban a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            [moderatorAddress]: CommunityRole.Moderator
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, moderatorAddress)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to unban ${moderatorAddress} from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to unban an owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            [ownerAddress]: CommunityRole.Owner
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToUnbanMemberFromCommunity(communityId, memberAddress, ownerAddress)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to unban ${ownerAddress} from community ${communityId}`
            )
          )
        })
      })

      describe('and tries to unban a non-member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            [nonMemberAddress]: CommunityRole.None
          })
        })

        it('should throw NotAuthorizedError', async () => {
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
  })

  describe('validatePermissionToUpdateMemberRole', () => {
    describe('when trying to update own role', () => {
      const communityId = 'community-1'
      const address = '0x123'
      const newRole = CommunityRole.Moderator

      it('should throw NotAuthorizedError', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, address, address, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(`The user ${address} cannot update their own role in community ${communityId}`)
        )
      })
    })

    describe('when the updater does not have assign_roles permission', () => {
      const communityId = 'community-1'
      const updaterAddress = '0x123'
      const targetAddress = '0x456'
      const newRole = CommunityRole.Moderator

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Member,
          [targetAddress]: CommunityRole.Member
        })
      })

      it('should throw NotAuthorizedError', async () => {
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
      const communityId = 'community-1'
      const updaterAddress = '0x123'
      const targetAddress = '0x456'
      const newRole = CommunityRole.Owner

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Moderator
        })
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })

    describe('when the updater cannot act on target member', () => {
      const communityId = 'community-1'
      const updaterAddress = '0x123'
      const targetAddress = '0x456'
      const newRole = CommunityRole.Moderator

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Owner
        })
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(
          roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
          )
        )
      })
    })

    describe('when the user is an owner', () => {
      const communityId = 'community-1'
      const updaterAddress = '0x123'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Owner
        })
      })

      describe('and tries to promote a member to moderator', () => {
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [updaterAddress]: CommunityRole.Owner,
            [targetAddress]: CommunityRole.Member
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
          ).resolves.not.toThrow()
        })
      })

      describe('and tries to demote a moderator to member', () => {
        const targetAddress = '0x456'
        const newRole = CommunityRole.Member

        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [updaterAddress]: CommunityRole.Owner,
            [targetAddress]: CommunityRole.Moderator
          })
        })

        it('should allow the action', async () => {
          await expect(
            roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
          ).resolves.not.toThrow()
        })
      })
    })

    describe('when the user is a moderator', () => {
      const communityId = 'community-1'
      const updaterAddress = '0x123'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator
        })
      })

      describe('and tries to promote a member to moderator', () => {
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [updaterAddress]: CommunityRole.Moderator,
            [targetAddress]: CommunityRole.Member
          })
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            roles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
            )
          )
        })
      })

      describe('and tries to demote another moderator to member', () => {
        const targetAddress = '0x456'
        const newRole = CommunityRole.Member

        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [updaterAddress]: CommunityRole.Moderator,
            [targetAddress]: CommunityRole.Moderator
          })
        })

        it('should throw NotAuthorizedError', async () => {
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
  })

  describe('validatePermissionToAddPlacesToCommunity', () => {
    const communityId = 'test-community'

    describe('when the user is an owner', () => {
      const ownerAddress = '0xowner'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('when the user is a moderator', () => {
      const moderatorAddress = '0xmoderator'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action', async () => {
        await expect(
          roles.validatePermissionToAddPlacesToCommunity(communityId, moderatorAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('when the user is a member', () => {
      const memberAddress = '0xmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to add places to the community`)
        )
      })
    })

    describe('when the user is not a member', () => {
      const nonMemberAddress = '0xnonmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToAddPlacesToCommunity(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${nonMemberAddress} doesn't have permission to add places to the community`)
        )
      })
    })
  })

  describe('validatePermissionToRemovePlacesFromCommunity', () => {
    const communityId = 'test-community'

    describe('when the user is an owner', () => {
      const ownerAddress = '0xowner'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action', async () => {
        await expect(
          roles.validatePermissionToRemovePlacesFromCommunity(communityId, ownerAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('when the user is a moderator', () => {
      const moderatorAddress = '0xmoderator'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action', async () => {
        await expect(
          roles.validatePermissionToRemovePlacesFromCommunity(communityId, moderatorAddress)
        ).resolves.not.toThrow()
      })
    })

    describe('when the user is a member', () => {
      const memberAddress = '0xmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToRemovePlacesFromCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to remove places from the community`
          )
        )
      })
    })

    describe('when the user is not a member', () => {
      const nonMemberAddress = '0xnonmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError', async () => {
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

  describe('validatePermissionToUpdatePlaces', () => {
    const communityId = 'test-community'

    describe('when the user is an owner', () => {
      const ownerAddress = '0xowner'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToUpdatePlaces(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('when the user is a moderator', () => {
      const moderatorAddress = '0xmoderator'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToUpdatePlaces(communityId, moderatorAddress)).resolves.not.toThrow()
      })
    })

    describe('when the user is a member', () => {
      const memberAddress = '0xmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToUpdatePlaces(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to update places in the community`)
        )
      })
    })

    describe('when the user is not a member', () => {
      const nonMemberAddress = '0xnonmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToUpdatePlaces(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${nonMemberAddress} doesn't have permission to update places in the community`
          )
        )
      })
    })
  })

  describe('validatePermissionToEditCommunity', () => {
    const communityId = 'test-community'

    describe('when the user is an owner', () => {
      const ownerAddress = '0xowner'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToEditCommunity(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('when the user is a moderator', () => {
      const moderatorAddress = '0xmoderator'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToEditCommunity(communityId, moderatorAddress)).resolves.not.toThrow()
      })
    })

    describe('when the user is a member', () => {
      const memberAddress = '0xmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToEditCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to edit the community`)
        )
      })
    })

    describe('when the user is not a member', () => {
      const nonMemberAddress = '0xnonmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToEditCommunity(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${nonMemberAddress} doesn't have permission to edit the community`)
        )
      })
    })
  })

  describe('validatePermissionToDeleteCommunity', () => {
    const communityId = 'test-community'

    describe('when the user is an owner', () => {
      const ownerAddress = '0xowner'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToDeleteCommunity(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('when the user is a moderator', () => {
      const moderatorAddress = '0xmoderator'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToDeleteCommunity(communityId, moderatorAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${moderatorAddress} doesn't have permission to delete the community`)
        )
      })
    })

    describe('when the user is a member', () => {
      const memberAddress = '0xmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToDeleteCommunity(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${memberAddress} doesn't have permission to delete the community`)
        )
      })
    })

    describe('when the user is not a member', () => {
      const nonMemberAddress = '0xnonmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToDeleteCommunity(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${nonMemberAddress} doesn't have permission to delete the community`)
        )
      })
    })
  })

  describe('validatePermissionToGetBannedMembers', () => {
    const communityId = 'test-community'

    describe('when the user is an owner', () => {
      const ownerAddress = '0xowner'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToGetBannedMembers(communityId, ownerAddress)).resolves.not.toThrow()
      })
    })

    describe('when the user is a moderator', () => {
      const moderatorAddress = '0xmoderator'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToGetBannedMembers(communityId, moderatorAddress)).resolves.not.toThrow()
      })
    })

    describe('when the user is a member', () => {
      const memberAddress = '0xmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToGetBannedMembers(communityId, memberAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${memberAddress} doesn't have permission to get banned members from the community`
          )
        )
      })
    })

    describe('when the user is not a member', () => {
      const nonMemberAddress = '0xnonmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToGetBannedMembers(communityId, nonMemberAddress)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${nonMemberAddress} doesn't have permission to get banned members from the community`
          )
        )
      })
    })
  })

  describe('validatePermissionToLeaveCommunity', () => {
    const communityId = 'test-community'

    describe('when the user is an owner', () => {
      const ownerAddress = '0xowner'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(roles.validatePermissionToLeaveCommunity(communityId, ownerAddress)).rejects.toThrow(
          new NotAuthorizedError(`The owner cannot leave the community ${communityId}`)
        )
      })
    })

    describe('when the user is a moderator', () => {
      const moderatorAddress = '0xmoderator'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToLeaveCommunity(communityId, moderatorAddress)).resolves.not.toThrow()
      })
    })

    describe('when the user is a member', () => {
      const memberAddress = '0xmember'

      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should allow the action', async () => {
        await expect(roles.validatePermissionToLeaveCommunity(communityId, memberAddress)).resolves.not.toThrow()
      })
    })
  })
})
