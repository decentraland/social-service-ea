import { CommunityRole, CommunityPermission } from '../../../src/types'
import {
  hasPermission,
  getRolePermissions,
  OWNER_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  COMMUNITY_ROLES
} from '../../../src/logic/community-roles'

describe('Community Roles Utils', () => {
  describe('hasPermission', () => {
    describe('when checking permissions for owner role', () => {
      it.each(OWNER_PERMISSIONS)('should grant %s permission to owner', (permission) => {
        expect(hasPermission(CommunityRole.Owner, permission)).toBe(true)
      })
    })

    describe('when checking permissions for moderator role', () => {
      it.each(MODERATOR_PERMISSIONS)('should grant %s permission to moderator', (permission) => {
        expect(hasPermission(CommunityRole.Moderator, permission)).toBe(true)
      })

      it.each(OWNER_PERMISSIONS.filter((p) => !MODERATOR_PERMISSIONS.includes(p)))(
        'should deny %s permission to moderator as it is owner-only',
        (permission) => {
          expect(hasPermission(CommunityRole.Moderator, permission)).toBe(false)
        }
      )
    })

    describe('when checking permissions for member role', () => {
      it.each([...OWNER_PERMISSIONS, ...MODERATOR_PERMISSIONS])(
        'should deny %s permission to member as it requires elevated privileges',
        (permission) => {
          expect(hasPermission(CommunityRole.Member, permission)).toBe(false)
        }
      )
    })

    describe('when checking permissions for none role', () => {
      it.each([...OWNER_PERMISSIONS, ...MODERATOR_PERMISSIONS])(
        'should deny %s permission to none role as it requires any role',
        (permission) => {
          expect(hasPermission(CommunityRole.None, permission)).toBe(false)
        }
      )
    })
  })

  describe('getRolePermissions', () => {
    describe('when getting permissions for defined roles', () => {
      it.each(Object.entries(COMMUNITY_ROLES))(
        'should return the correct set of permissions for %s role',
        (role, permissions) => {
          expect(getRolePermissions(role as CommunityRole)).toEqual(permissions)
        }
      )
    })

    describe('when getting permissions for undefined role', () => {
      it('should return an empty array for unknown role', () => {
        const permissions = getRolePermissions('unknown' as CommunityRole)
        expect(permissions).toEqual([])
      })
    })
  })
})
