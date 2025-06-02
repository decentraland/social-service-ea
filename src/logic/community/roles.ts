import { CommunityRole, CommunityPermission } from '../../types/entities'
import { AppComponents } from '../../types/system'
import { ICommunityRolesComponent } from './types'

export const OWNER_PERMISSIONS: CommunityPermission[] = [
  'edit_info',
  'add_places',
  'remove_places',
  'accept_requests',
  'reject_requests',
  'ban_players',
  'send_invitations',
  'edit_settings',
  'delete_community',
  'assign_roles'
]

export const MODERATOR_PERMISSIONS: CommunityPermission[] = [
  'edit_info',
  'add_places',
  'remove_places',
  'accept_requests',
  'reject_requests',
  'ban_players',
  'send_invitations'
]

export const COMMUNITY_ROLES: Record<CommunityRole, CommunityPermission[]> = {
  [CommunityRole.Owner]: OWNER_PERMISSIONS,
  [CommunityRole.Moderator]: MODERATOR_PERMISSIONS,
  [CommunityRole.Member]: [],
  [CommunityRole.None]: []
}

// [targetRole]: [roles that can act on targetRole]
export const ROLE_ACTION_TRANSITIONS: Record<CommunityRole, CommunityRole[]> = {
  [CommunityRole.Owner]: [], // No one can act on owners
  [CommunityRole.Moderator]: [CommunityRole.Owner], // Only owners can act on moderators
  [CommunityRole.Member]: [CommunityRole.Owner, CommunityRole.Moderator], // Owners and moderators can act on members
  [CommunityRole.None]: [] // N/A
}

export function createCommunityRolesComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'logs'>
): ICommunityRolesComponent {
  const { communitiesDb } = components

  const getRolePermissions = (role: CommunityRole): CommunityPermission[] => {
    return COMMUNITY_ROLES[role] ?? []
  }

  const hasPermission = (role: CommunityRole, permission: CommunityPermission): boolean => {
    return getRolePermissions(role)?.includes(permission) ?? false
  }

  return {
    hasPermission,
    getRolePermissions,

    async canKickMemberFromCommunity(
      communityId: string,
      kickerAddress: string,
      targetAddress: string
    ): Promise<boolean> {
      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [kickerAddress, targetAddress])
      const kickerRole = roles[kickerAddress]
      const targetRole = roles[targetAddress]

      return ROLE_ACTION_TRANSITIONS[targetRole]?.includes(kickerRole)
    }
  }
}
