import { NotAuthorizedError } from '@dcl/http-commons'
import {
  CommunityRole,
  CommunityPermission,
  canActOnMember,
  canBanMember,
  canUpdateMemberRole,
  hasPermission,
  isMember
} from '../../types/entities'
import { AppComponents } from '../../types/system'
import { ICommunityRolesComponent, CommunityPost } from './types'
import { normalizeAddress } from '../../utils/address'

export {
  ROLE_ACTION_TRANSITIONS,
  OWNER_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  COMMUNITY_ROLES,
  canActOnMember,
  canBanMember,
  canUpdateMemberRole
} from '../../types/entities'

export function createCommunityRolesComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'logs'>
): ICommunityRolesComponent {
  const { communitiesDb } = components

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
    async validatePermissionToTransferOwnership(
      communityId: string,
      ownerAddress: string,
      targetAddress: string
    ): Promise<void> {
      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [ownerAddress, targetAddress])
      const updaterRole = roles[normalizeAddress(ownerAddress)]
      const targetRole = roles[normalizeAddress(targetAddress)]

      // Only current owners can transfer; target must be an existing member (not None)
      if (updaterRole !== CommunityRole.Owner) {
        throw new NotAuthorizedError(
          `The user ${ownerAddress} doesn't have permission to transfer ownership in community ${communityId}`
        )
      }

      if (!isMember(targetRole)) {
        throw new NotAuthorizedError(`The target user ${targetAddress} is not a member of community ${communityId}`)
      }
    },
    async validatePermissionToKickMemberFromCommunity(
      communityId: string,
      kickerAddress: string,
      targetAddress: string
    ): Promise<void> {
      const roles = await communitiesDb.getCommunityMemberRoles(communityId, [kickerAddress, targetAddress])
      const kickerRole = roles[normalizeAddress(kickerAddress)]
      const targetRole = roles[normalizeAddress(targetAddress)]

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
      const bannerRole = roles[normalizeAddress(bannerAddress)]
      const targetRole = roles[normalizeAddress(targetAddress)]

      if (!canBanMember(bannerRole, targetRole)) {
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
      const unbannerRole = roles[normalizeAddress(unbannerAddress)]
      const targetRole = roles[normalizeAddress(targetAddress)]

      // Unban shares the ban rule: see canBanMember.
      if (!canBanMember(unbannerRole, targetRole)) {
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
      const updaterRole = roles[normalizeAddress(updaterAddress)]
      const targetRole = roles[normalizeAddress(targetAddress)]

      if (!canUpdateMemberRole(updaterRole, targetRole, newRole)) {
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
    validatePermissionToEditCommunitySettings: validatePermission('edit_settings', 'update the community privacy'),
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
    validatePermissionToInviteUsers: validatePermission('invite_users', 'invite users'),
    validatePermissionToEditCommunityName: validatePermission('edit_name', 'edit the community name'),
    validatePermissionToCreatePost: validatePermission('create_posts', 'create posts in the community'),
    async validatePermissionToDeletePost(post: CommunityPost, deleterAddress: string): Promise<void> {
      const role = await communitiesDb.getCommunityMemberRole(post.communityId, deleterAddress)

      if (!role || !hasPermission(role, 'delete_posts')) {
        throw new NotAuthorizedError(
          `The user ${deleterAddress} doesn't have permission to delete posts from the community`
        )
      }

      // If the user is a moderator (not owner), they can only delete their own posts
      if (role === CommunityRole.Moderator) {
        const normalizedDeleterAddress = deleterAddress.toLowerCase()
        const normalizedAuthorAddress = post.authorAddress.toLowerCase()

        if (normalizedDeleterAddress !== normalizedAuthorAddress) {
          throw new NotAuthorizedError(
            `The user ${deleterAddress} doesn't have permission to delete posts from the community`
          )
        }
      }
    }
  }
}
