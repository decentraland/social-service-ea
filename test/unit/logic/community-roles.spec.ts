import { CommunityRole } from '../../../src/types'
import { createCommunityRolesComponent, ROLE_ACTION_TRANSITIONS } from '../../../src/logic/community/roles'
import { OWNER_PERMISSIONS, MODERATOR_PERMISSIONS, COMMUNITY_ROLES } from '../../../src/logic/community/roles'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs } from '../../mocks/components/logs'

describe('Community Roles Component', () => {
  const roles = createCommunityRolesComponent({ communitiesDb: mockCommunitiesDB, logs: mockLogs })

  describe('hasPermission', () => {
    describe('when checking permissions for owner role', () => {
      it.each(OWNER_PERMISSIONS)('should grant %s permission to owner', (permission) => {
        expect(roles.hasPermission(CommunityRole.Owner, permission)).toBe(true)
      })
    })

    describe('when checking permissions for moderator role', () => {
      it.each(MODERATOR_PERMISSIONS)('should grant %s permission to moderator', (permission) => {
        expect(roles.hasPermission(CommunityRole.Moderator, permission)).toBe(true)
      })

      it.each(OWNER_PERMISSIONS.filter((p) => !MODERATOR_PERMISSIONS.includes(p)))(
        'should deny %s permission to moderator as it is owner-only',
        (permission) => {
          expect(roles.hasPermission(CommunityRole.Moderator, permission)).toBe(false)
        }
      )
    })

    describe('when checking permissions for member role', () => {
      it.each([...OWNER_PERMISSIONS, ...MODERATOR_PERMISSIONS])(
        'should deny %s permission to member as it requires elevated privileges',
        (permission) => {
          expect(roles.hasPermission(CommunityRole.Member, permission)).toBe(false)
        }
      )
    })

    describe('when checking permissions for none role', () => {
      it.each([...OWNER_PERMISSIONS, ...MODERATOR_PERMISSIONS])(
        'should deny %s permission to none role as it requires any role',
        (permission) => {
          expect(roles.hasPermission(CommunityRole.None, permission)).toBe(false)
        }
      )
    })
  })

  describe('getRolePermissions', () => {
    describe('when getting permissions for defined roles', () => {
      it.each(Object.entries(COMMUNITY_ROLES))(
        'should return the correct set of permissions for %s role',
        (role, permissions) => {
          expect(roles.getRolePermissions(role as CommunityRole)).toEqual(permissions)
        }
      )
    })

    describe('when getting permissions for undefined role', () => {
      it('should return an empty array for unknown role', () => {
        const permissions = roles.getRolePermissions('unknown' as CommunityRole)
        expect(permissions).toEqual([])
      })
    })
  })

  describe('ROLE_ACTION_TRANSITIONS', () => {
    it('should define correct transitions for each role', () => {
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.Owner]).toEqual([])
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.Moderator]).toEqual([CommunityRole.Owner])
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.Member]).toEqual([CommunityRole.Owner, CommunityRole.Moderator])
      expect(ROLE_ACTION_TRANSITIONS[CommunityRole.None]).toEqual([])
    })
  })

  describe('canKickMemberFromCommunity', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    describe('when checking if owner can kick', () => {
      it('should allow owner to kick a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Member
        })
        const result = await roles.canKickMemberFromCommunity(communityId, ownerAddress, memberAddress)
        expect(result).toBe(true)
      })

      it('should allow owner to kick a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [moderatorAddress]: CommunityRole.Moderator
        })
        const result = await roles.canKickMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
        expect(result).toBe(true)
      })

      it('should not allow owner to kick another owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          ['0xother-owner']: CommunityRole.Owner
        })
        const result = await roles.canKickMemberFromCommunity(communityId, ownerAddress, '0xother-owner')
        expect(result).toBe(false)
      })
    })

    describe('when checking if moderator can kick', () => {
      it('should allow moderator to kick a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member
        })
        const result = await roles.canKickMemberFromCommunity(communityId, moderatorAddress, memberAddress)
        expect(result).toBe(true)
      })

      it('should not allow moderator to kick another moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          ['0xother-moderator']: CommunityRole.Moderator
        })
        const result = await roles.canKickMemberFromCommunity(communityId, moderatorAddress, '0xother-moderator')
        expect(result).toBe(false)
      })

      it('should not allow moderator to kick an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner
        })
        const result = await roles.canKickMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
        expect(result).toBe(false)
      })
    })

    describe('when checking if member can kick', () => {
      it('should not allow member to kick another member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          ['0xother-member']: CommunityRole.Member
        })
        const result = await roles.canKickMemberFromCommunity(communityId, memberAddress, '0xother-member')
        expect(result).toBe(false)
      })

      it('should not allow member to kick a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator
        })
        const result = await roles.canKickMemberFromCommunity(communityId, memberAddress, moderatorAddress)
        expect(result).toBe(false)
      })

      it('should not allow member to kick an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [ownerAddress]: CommunityRole.Owner
        })
        const result = await roles.canKickMemberFromCommunity(communityId, memberAddress, ownerAddress)
        expect(result).toBe(false)
      })
    })
  })

  describe('canBanMemberFromCommunity', () => {
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
        const result = await roles.canBanMemberFromCommunity(communityId, ownerAddress, memberAddress)
        expect(result).toBe(true)
      })

      it('should allow owner to ban a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [moderatorAddress]: CommunityRole.Moderator
        })
        const result = await roles.canBanMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
        expect(result).toBe(true)
      })

      it('should not allow owner to ban another owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          ['0xother-owner']: CommunityRole.Owner
        })
        const result = await roles.canBanMemberFromCommunity(communityId, ownerAddress, '0xother-owner')
        expect(result).toBe(false)
      })

      it('should allow owner to ban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
        const result = await roles.canBanMemberFromCommunity(communityId, ownerAddress, nonMemberAddress)
        expect(result).toBe(true)
      })
    })

    describe('when checking if moderator can ban', () => {
      it('should allow moderator to ban a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member
        })
        const result = await roles.canBanMemberFromCommunity(communityId, moderatorAddress, memberAddress)
        expect(result).toBe(true)
      })

      it('should not allow moderator to ban another moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          ['0xother-moderator']: CommunityRole.Moderator
        })
        const result = await roles.canBanMemberFromCommunity(communityId, moderatorAddress, '0xother-moderator')
        expect(result).toBe(false)
      })

      it('should not allow moderator to ban an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner
        })
        const result = await roles.canBanMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
        expect(result).toBe(false)
      })

      it('should allow moderator to ban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [nonMemberAddress]: CommunityRole.None
        })
        const result = await roles.canBanMemberFromCommunity(communityId, moderatorAddress, nonMemberAddress)
        expect(result).toBe(true)
      })
    })

    describe('when checking if member can ban', () => {
      it('should not allow member to ban another member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          ['0xother-member']: CommunityRole.Member
        })
        const result = await roles.canBanMemberFromCommunity(communityId, memberAddress, '0xother-member')
        expect(result).toBe(false)
      })

      it('should not allow member to ban a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator
        })
        const result = await roles.canBanMemberFromCommunity(communityId, memberAddress, moderatorAddress)
        expect(result).toBe(false)
      })

      it('should not allow member to ban an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [ownerAddress]: CommunityRole.Owner
        })
        const result = await roles.canBanMemberFromCommunity(communityId, memberAddress, ownerAddress)
        expect(result).toBe(false)
      })

      it('should not allow member to ban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [nonMemberAddress]: CommunityRole.None
        })
        const result = await roles.canBanMemberFromCommunity(communityId, memberAddress, nonMemberAddress)
        expect(result).toBe(false)
      })
    })
  })

  describe('canUnbanMemberFromCommunity', () => {
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
        const result = await roles.canUnbanMemberFromCommunity(communityId, ownerAddress, memberAddress)
        expect(result).toBe(true)
      })

      it('should allow owner to unban a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [moderatorAddress]: CommunityRole.Moderator
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, ownerAddress, moderatorAddress)
        expect(result).toBe(true)
      })

      it('should not allow owner to unban another owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          ['0xother-owner']: CommunityRole.Owner
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, ownerAddress, '0xother-owner')
        expect(result).toBe(false)
      })

      it('should allow owner to unban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [ownerAddress]: CommunityRole.Owner,
          [nonMemberAddress]: CommunityRole.None
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, ownerAddress, nonMemberAddress)
        expect(result).toBe(true)
      })
    })

    describe('when checking if moderator can unban', () => {
      it('should allow moderator to unban a member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [memberAddress]: CommunityRole.Member
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, moderatorAddress, memberAddress)
        expect(result).toBe(true)
      })

      it('should not allow moderator to unban another moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          ['0xother-moderator']: CommunityRole.Moderator
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, moderatorAddress, '0xother-moderator')
        expect(result).toBe(false)
      })

      it('should not allow moderator to unban an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [ownerAddress]: CommunityRole.Owner
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, moderatorAddress, ownerAddress)
        expect(result).toBe(false)
      })

      it('should allow moderator to unban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [moderatorAddress]: CommunityRole.Moderator,
          [nonMemberAddress]: CommunityRole.None
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, moderatorAddress, nonMemberAddress)
        expect(result).toBe(true)
      })
    })

    describe('when checking if member can unban', () => {
      it('should not allow member to unban another member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          ['0xother-member']: CommunityRole.Member
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, memberAddress, '0xother-member')
        expect(result).toBe(false)
      })

      it('should not allow member to unban a moderator', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [moderatorAddress]: CommunityRole.Moderator
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, memberAddress, moderatorAddress)
        expect(result).toBe(false)
      })

      it('should not allow member to unban an owner', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [ownerAddress]: CommunityRole.Owner
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, memberAddress, ownerAddress)
        expect(result).toBe(false)
      })

      it('should not allow member to unban a non-member', async () => {
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [memberAddress]: CommunityRole.Member,
          [nonMemberAddress]: CommunityRole.None
        })
        const result = await roles.canUnbanMemberFromCommunity(communityId, memberAddress, nonMemberAddress)
        expect(result).toBe(false)
      })
    })
  })

  describe('canUpdateMemberRole', () => {
    describe('when trying to update own role', () => {
      it('should return false', async () => {
        const communityId = 'community-1'
        const address = '0x123'
        const newRole = CommunityRole.Moderator

        const result = await roles.canUpdateMemberRole(communityId, address, address, newRole)

        expect(result).toBe(false)
      })
    })

    describe('when updater does not have assign_roles permission', () => {
      it('should return false', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)

        const result = await roles.canUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

        expect(result).toBe(false)
      })
    })

    describe('when trying to set role to Owner', () => {
      it('should return false', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Owner

        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Moderator
        })

        const result = await roles.canUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

        expect(result).toBe(false)
      })
    })

    describe('when updater cannot act on target member', () => {
      it('should return false', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Moderator,
          [targetAddress]: CommunityRole.Owner
        })

        const result = await roles.canUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

        expect(result).toBe(false)
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

        const result = await roles.canUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

        expect(result).toBe(true)
      })

      it('should allow demoting a moderator to member', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Member

        mockCommunitiesDB.getCommunityMemberRole
          .mockResolvedValueOnce(CommunityRole.Owner) // updater role
          .mockResolvedValueOnce(CommunityRole.Moderator) // target role

        const result = await roles.canUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

        expect(result).toBe(true)
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

        const result = await roles.canUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

        expect(result).toBe(false)
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

        const result = await roles.canUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

        expect(result).toBe(false)
      })
    })
  })
})
