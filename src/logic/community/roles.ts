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

  const isMember = (role: CommunityRole): boolean => {
    return !!role && role !== CommunityRole.None
  }

  const canActOnMember = (actorRole: CommunityRole, targetRole: CommunityRole): boolean => {
    return ROLE_ACTION_TRANSITIONS[targetRole]?.includes(actorRole) ?? false
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

      return canActOnMember(kickerRole, targetRole)
    },

    async canBanMemberFromCommunity(
      communityId: string,
      bannerAddress: string,
      targetAddress: string
    ): Promise<boolean> {
      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [bannerAddress, targetAddress])
      const bannerRole = roles[bannerAddress]
      const targetRole = roles[targetAddress]

      return (
        hasPermission(bannerRole, 'ban_players') && (canActOnMember(bannerRole, targetRole) || !isMember(targetRole))
      )
    },

    async canUnbanMemberFromCommunity(
      communityId: string,
      unbannerAddress: string,
      targetAddress: string
    ): Promise<boolean> {
      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [unbannerAddress, targetAddress])
      const unbannerRole = roles[unbannerAddress]
      const targetRole = roles[targetAddress]

      return (
        hasPermission(unbannerRole, 'ban_players') &&
        (canActOnMember(unbannerRole, targetRole) || !isMember(targetRole))
      )
    },

    async canUpdateMemberRole(
      communityId: string,
      updaterAddress: string,
      targetAddress: string,
      newRole: CommunityRole
    ): Promise<boolean> {
      if (updaterAddress.toLowerCase() === targetAddress.toLowerCase()) {
        return false
      }

      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [updaterAddress, targetAddress])
      const updaterRole = roles[updaterAddress]
      const targetRole = roles[targetAddress]

      return (
        hasPermission(updaterRole, 'assign_roles') &&
        canActOnMember(updaterRole, targetRole) &&
        newRole !== CommunityRole.Owner
      )
    },

    async canAddPlacesToCommunity(communityId: string, adderAddress: string): Promise<boolean> {
      const role = await communitiesDb.getCommunityMemberRole(communityId, adderAddress)
      return role && hasPermission(role, 'add_places')
    },

    async canRemovePlacesFromCommunity(communityId: string, removerAddress: string): Promise<boolean> {
      const role = await communitiesDb.getCommunityMemberRole(communityId, removerAddress)
      return role && hasPermission(role, 'remove_places')
    },

    async canEditCommunity(communityId: string, editorAddress: string): Promise<boolean> {
      const role = await communitiesDb.getCommunityMemberRole(communityId, editorAddress)
      return role && hasPermission(role, 'edit_info')
    }
  }
}
