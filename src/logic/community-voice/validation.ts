import { NotAuthorizedError } from '@dcl/http-commons'
import { CommunityRole } from '../../types/entities'
import {
  CommunityVoiceChatNotFoundError,
  CommunityVoiceChatPermissionError,
  UserNotCommunityMemberError
} from './errors'
import { ICommsGatekeeperComponent, ICommunitiesDatabaseComponent } from '../../types/components'
import { Community, CommunityPrivacyEnum } from '../community/types'
import { normalizeAddress } from '../../utils/address'

/**
 * Validates that a user is entitled to be a participant of a community's voice chat room.
 *
 * Mirrors the join contract so every self-service voice action enforces the same rule set:
 * the room must be live, the community must exist and be active, the user must not be banned,
 * and a private community requires membership.
 *
 * @param communitiesDb - Communities database adapter
 * @param commsGatekeeper - Comms Gatekeeper adapter
 * @param communityId - Community ID
 * @param userAddress - Address of the user acting on their own behalf
 * @returns The user's role in the community
 * @throws {CommunityVoiceChatNotFoundError} When the room is not active or the community is gone
 * @throws {NotAuthorizedError} When the user is banned from the community
 * @throws {UserNotCommunityMemberError} When a non-member targets a private community's room
 */
export async function validateCommunityVoiceChatParticipation(
  communitiesDb: ICommunitiesDatabaseComponent,
  commsGatekeeper: ICommsGatekeeperComponent,
  communityId: string,
  userAddress: string
): Promise<CommunityRole> {
  // Independent lookups, fetched together to keep the added authorization off the critical path.
  const [voiceChatStatus, community, isBanned] = await Promise.all([
    commsGatekeeper.getCommunityVoiceChatStatus(communityId),
    communitiesDb.getCommunity(communityId, userAddress),
    communitiesDb.isMemberBanned(communityId, userAddress)
  ])

  if (!voiceChatStatus?.isActive || !community) {
    throw new CommunityVoiceChatNotFoundError(communityId)
  }

  if (isBanned) {
    throw new NotAuthorizedError(`The user ${userAddress} is banned from community ${communityId}`)
  }

  const userRole = community.role ?? CommunityRole.None

  if (community.privacy === CommunityPrivacyEnum.Private && userRole === CommunityRole.None) {
    throw new UserNotCommunityMemberError(userAddress, communityId)
  }

  return userRole
}

/**
 * Validates that the acting user may moderate the target user in a community's voice chat.
 *
 * Requires the actor to be an owner or moderator, and protects the owner from everyone but
 * themselves. Peer moderators may act on each other. Both roles are resolved in one batched query.
 *
 * @param communitiesDb - Communities database adapter
 * @param communityId - Community ID
 * @param actingUserAddress - Address of the moderator or owner performing the action
 * @param targetUserAddress - Address of the user being acted on
 * @param action - Human readable action used to build the error messages
 * @returns The acting and target user roles
 * @throws {CommunityVoiceChatPermissionError} When the actor is not privileged or is outranked
 */
export async function validateCommunityVoiceChatModerator(
  communitiesDb: ICommunitiesDatabaseComponent,
  communityId: string,
  actingUserAddress: string,
  targetUserAddress: string,
  action: string
): Promise<{ actingUserRole: CommunityRole; targetUserRole: CommunityRole }> {
  const normalizedActingUserAddress = normalizeAddress(actingUserAddress)
  const normalizedTargetUserAddress = normalizeAddress(targetUserAddress)

  const roles = await communitiesDb.getCommunityMemberRoles(communityId, [
    normalizedActingUserAddress,
    normalizedTargetUserAddress
  ])
  const actingUserRole = roles[normalizedActingUserAddress] ?? CommunityRole.None
  const targetUserRole = roles[normalizedTargetUserAddress] ?? CommunityRole.None

  if (actingUserRole !== CommunityRole.Owner && actingUserRole !== CommunityRole.Moderator) {
    throw new CommunityVoiceChatPermissionError(`Only community owners and moderators can ${action}`)
  }

  // Only the owner may be acted on by nobody but themselves. Peer moderators can still moderate
  // each other: these actions are confined to the live room and are reversible, unlike the
  // membership hierarchy in roles.ts, which governs persistent state.
  const isSelfAction = normalizedActingUserAddress === normalizedTargetUserAddress
  if (!isSelfAction && targetUserRole === CommunityRole.Owner && actingUserRole !== CommunityRole.Owner) {
    throw new CommunityVoiceChatPermissionError(`Not enough permissions to ${action} this user`)
  }

  return { actingUserRole, targetUserRole }
}

/**
 * Helper function to validate target user permissions for voice chat operations (promote/demote) based on community privacy
 * @param communitiesDb - Communities database adapter
 * @param community - Community object with privacy information
 * @param communityId - Community ID
 * @param targetUserAddress - Target user address
 * @param knownTargetUserRole - Already resolved target role, when the caller has one
 * @returns Promise<void> - Throws error if validation fails
 */
export async function validateCommunityVoiceChatTargetUser(
  communitiesDb: ICommunitiesDatabaseComponent,
  community: Community,
  communityId: string,
  targetUserAddress: string,
  knownTargetUserRole?: CommunityRole
): Promise<void> {
  // For public communities: no restrictions, anyone in voice chat can be promoted/demoted.
  // Let comms-gatekeeper validate if user is actually in voice chat
  if (community.privacy !== CommunityPrivacyEnum.Private) {
    return
  }

  // For private communities: user must be member AND NOT banned
  const targetUserRole =
    knownTargetUserRole ?? (await communitiesDb.getCommunityMemberRole(communityId, targetUserAddress))

  // User must be a member first
  if (targetUserRole === CommunityRole.None) {
    throw new UserNotCommunityMemberError(targetUserAddress, communityId)
  }

  // If user is a member, check they are not banned
  const isTargetBanned = await communitiesDb.isMemberBanned(communityId, targetUserAddress)
  if (isTargetBanned) {
    throw new UserNotCommunityMemberError(targetUserAddress, communityId)
  }
}
