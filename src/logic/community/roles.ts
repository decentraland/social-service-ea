import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityRole, CommunityPermission } from '../../types/entities'
import { AppComponents } from '../../types/system'
import { ICommunityRolesComponent } from './types'

export const OWNER_PERMISSIONS: CommunityPermission[] = [
  'edit_info',
  'add_places',
  'remove_places',
  'accept_requests',
  'reject_requests',
  'view_requests',
  'ban_players',
  'send_invitations',
  'edit_settings',
  'delete_community',
  'assign_roles',
  'invite_users'
]

export const MODERATOR_PERMISSIONS: CommunityPermission[] = [
  'edit_info',
  'add_places',
  'remove_places',
  'accept_requests',
  'reject_requests',
  'view_requests',
  'ban_players',
  'send_invitations',
  'invite_users'
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

  const validatePermission = (permission: CommunityPermission, action: string) =>
    validatePermissions([permission], action)

  const validatePermissions = (permissions: CommunityPermission[], action: string) => {
    return async (communityId: string, userAddress: string): Promise<void> => {
      const role = await communitiesDb.getCommunityMemberRole(communityId, userAddress)
      if (!role || !permissions.every((permission) => hasPermission(role, permission))) {
        throw new NotAuthorizedError(`The user ${userAddress} doesn't have permission to ${action}`)
      }
    }
  }

  return {
    async validatePermissionToKickMemberFromCommunity(
      communityId: string,
      kickerAddress: string,
      targetAddress: string
    ): Promise<void> {
      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [kickerAddress, targetAddress])
      const kickerRole = roles[kickerAddress]
      const targetRole = roles[targetAddress]

      if (!canActOnMember(kickerRole, targetRole)) {
        throw new NotAuthorizedError(
          `The user ${kickerAddress} doesn't have permission to kick ${targetAddress} from community ${communityId}`
        )
      }
    },

    validatePermissionToGetBannedMembers: validatePermission('ban_players', 'get banned members from the community'),

    async validatePermissionToBanMemberFromCommunity(
      communityId: string,
      bannerAddress: string,
      targetAddress: string
    ): Promise<void> {
      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [bannerAddress, targetAddress])
      const bannerRole = roles[bannerAddress]
      const targetRole = roles[targetAddress]

      if (
        !hasPermission(bannerRole, 'ban_players') ||
        (!canActOnMember(bannerRole, targetRole) && isMember(targetRole))
      ) {
        throw new NotAuthorizedError(
          `The user ${bannerAddress} doesn't have permission to ban ${targetAddress} from community ${communityId}`
        )
      }
    },

    async validatePermissionToUnbanMemberFromCommunity(
      communityId: string,
      unbannerAddress: string,
      targetAddress: string
    ): Promise<void> {
      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [unbannerAddress, targetAddress])
      const unbannerRole = roles[unbannerAddress]
      const targetRole = roles[targetAddress]

      if (
        !hasPermission(unbannerRole, 'ban_players') ||
        (!canActOnMember(unbannerRole, targetRole) && isMember(targetRole))
      ) {
        throw new NotAuthorizedError(
          `The user ${unbannerAddress} doesn't have permission to unban ${targetAddress} from community ${communityId}`
        )
      }
    },

    async validatePermissionToUpdateMemberRole(
      communityId: string,
      updaterAddress: string,
      targetAddress: string,
      newRole: CommunityRole
    ): Promise<void> {
      if (updaterAddress.toLowerCase() === targetAddress.toLowerCase()) {
        throw new NotAuthorizedError(
          `The user ${updaterAddress} cannot update their own role in community ${communityId}`
        )
      }

      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [updaterAddress, targetAddress])
      const updaterRole = roles[updaterAddress]
      const targetRole = roles[targetAddress]

      if (
        !hasPermission(updaterRole, 'assign_roles') ||
        !canActOnMember(updaterRole, targetRole) ||
        newRole === CommunityRole.Owner
      ) {
        throw new NotAuthorizedError(
          `The user ${updaterAddress} doesn't have permission to assign roles in community ${communityId}`
        )
      }
    },

    validatePermissionToAddPlacesToCommunity: validatePermission('add_places', 'add places to the community'),
    validatePermissionToRemovePlacesFromCommunity: validatePermission(
      'remove_places',
      'remove places from the community'
    ),
    validatePermissionToEditCommunity: validatePermission('edit_info', 'edit the community'),
    validatePermissionToUpdateCommunityPrivacy: validatePermission('edit_settings', 'update the community privacy'),
    validatePermissionToDeleteCommunity: validatePermission('delete_community', 'delete the community'),
    validatePermissionToUpdatePlaces: validatePermissions(
      ['add_places', 'remove_places'],
      'update places in the community'
    ),
    validatePermissionToLeaveCommunity: async (communityId: string, memberAddress: string): Promise<void> => {
      const memberRole = await communitiesDb.getCommunityMemberRole(communityId, memberAddress)

      // Owners cannot leave their communities
      if (memberRole === CommunityRole.Owner) {
        throw new NotAuthorizedError(`The owner cannot leave the community ${communityId}`)
      }
    },
    validatePermissionToAcceptAndRejectRequests: validatePermissions(
      ['accept_requests', 'reject_requests'],
      'accept and reject requests'
    ),
    validatePermissionToViewRequests: validatePermission('view_requests', 'view requests'),
    validatePermissionToInviteUsers: validatePermission('invite_users', 'invite users')
  }
}
