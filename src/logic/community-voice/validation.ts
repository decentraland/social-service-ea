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
 * Validates that the acting user may open or close a community's voice chat room.
 *
 * Requires an owner or moderator who is not banned. Both facts are resolved in two queries issued
 * together, so this stays a single round trip.
 *
 * @param communitiesDb - Communities database adapter
 * @param communityId - Community ID
 * @param actingUserAddress - Address of the moderator or owner performing the action
 * @param action - Human readable action used to build the error messages
 * @returns The acting user's role in the community
 * @throws {UserNotCommunityMemberError} When the actor holds no role in the community
 * @throws {CommunityVoiceChatPermissionError} When the actor is not privileged or is banned
 */
export async function validateCommunityVoiceChatHost(
  communitiesDb: ICommunitiesDatabaseComponent,
  communityId: string,
  actingUserAddress: string,
  action: string
): Promise<CommunityRole> {
  // Independent lookups, issued together so the ban check costs no extra round trip.
  const [actingUserRole, isActingUserBanned] = await Promise.all([
    communitiesDb.getCommunityMemberRole(communityId, actingUserAddress),
    communitiesDb.isMemberBanned(communityId, actingUserAddress)
  ])

  if (actingUserRole === CommunityRole.None) {
    throw new UserNotCommunityMemberError(actingUserAddress, communityId)
  }

  if (actingUserRole !== CommunityRole.Owner && actingUserRole !== CommunityRole.Moderator) {
    throw new CommunityVoiceChatPermissionError(`Only community owners and moderators can ${action}`)
  }

  // A ban is not guaranteed to clear the role row, so the role alone cannot be trusted.
  if (isActingUserBanned) {
    throw new CommunityVoiceChatPermissionError(`Banned users cannot ${action}`)
  }

  return actingUserRole
}

/**
 * Validates that the acting user may moderate the target user in a community's voice chat.
 *
 * Requires the actor to be an owner or moderator who is not banned, and protects the owner from
 * everyone but themselves. Peer moderators may act on each other. Roles and bans for both users
 * are resolved in two queries issued together, so this stays a single round trip.
 *
 * @param communitiesDb - Communities database adapter
 * @param communityId - Community ID
 * @param actingUserAddress - Address of the moderator or owner performing the action
 * @param targetUserAddress - Address of the user being acted on
 * @param action - Human readable action used to build the error messages
 * @returns The acting and target user roles, plus whether the target is banned
 * @throws {CommunityVoiceChatPermissionError} When the actor is not privileged, banned, or outranked
 */
export async function validateCommunityVoiceChatModerator(
  communitiesDb: ICommunitiesDatabaseComponent,
  communityId: string,
  actingUserAddress: string,
  targetUserAddress: string,
  action: string
): Promise<{ actingUserRole: CommunityRole; targetUserRole: CommunityRole; isTargetUserBanned: boolean }> {
  const normalizedActingUserAddress = normalizeAddress(actingUserAddress)
  const normalizedTargetUserAddress = normalizeAddress(targetUserAddress)
  const addresses = [normalizedActingUserAddress, normalizedTargetUserAddress]

  // Independent lookups, issued together so the ban check costs no extra round trip.
  const [roles, bannedAddresses] = await Promise.all([
    communitiesDb.getCommunityMemberRoles(communityId, addresses),
    communitiesDb.getBannedMemberAddresses(communityId, addresses)
  ])

  const actingUserRole = roles[normalizedActingUserAddress] ?? CommunityRole.None
  const targetUserRole = roles[normalizedTargetUserAddress] ?? CommunityRole.None
  const isActingUserBanned = bannedAddresses.includes(normalizedActingUserAddress)
  const isTargetUserBanned = bannedAddresses.includes(normalizedTargetUserAddress)

  if (actingUserRole !== CommunityRole.Owner && actingUserRole !== CommunityRole.Moderator) {
    throw new CommunityVoiceChatPermissionError(`Only community owners and moderators can ${action}`)
  }

  // A ban is not guaranteed to clear the role row, so the role alone cannot be trusted.
  if (isActingUserBanned) {
    throw new CommunityVoiceChatPermissionError(`Banned users cannot ${action}`)
  }

  // Only the owner may be acted on by nobody but themselves. Peer moderators can still moderate
  // each other: these actions are confined to the live room and are reversible, unlike the
  // membership hierarchy in roles.ts, which governs persistent state.
  const isSelfAction = normalizedActingUserAddress === normalizedTargetUserAddress
  if (!isSelfAction && targetUserRole === CommunityRole.Owner && actingUserRole !== CommunityRole.Owner) {
    throw new CommunityVoiceChatPermissionError(`Not enough permissions to ${action} this user`)
  }

  return { actingUserRole, targetUserRole, isTargetUserBanned }
}

/**
 * Validates that the target user is reachable by a moderation action, based on community privacy.
 *
 * The role is resolved by {@link validateCommunityVoiceChatModerator}, so this performs no lookups
 * of its own.
 *
 * @param community - Community object with privacy information
 * @param communityId - Community ID
 * @param targetUserAddress - Target user address
 * @param targetUserRole - Already resolved target role
 * @throws {UserNotCommunityMemberError} When the target is not a member of a private community
 */
export function validateCommunityVoiceChatTargetMembership(
  community: Community,
  communityId: string,
  targetUserAddress: string,
  targetUserRole: CommunityRole
): void {
  // Public communities take anyone the room already holds; comms-gatekeeper owns presence.
  if (community.privacy !== CommunityPrivacyEnum.Private) {
    return
  }

  if (targetUserRole === CommunityRole.None) {
    throw new UserNotCommunityMemberError(targetUserAddress, communityId)
  }
}

/**
 * Validates that the target user may be promoted or demoted, based on community privacy.
 *
 * Both facts are resolved by {@link validateCommunityVoiceChatModerator}, so this performs no
 * lookups of its own.
 *
 * @param community - Community object with privacy information
 * @param communityId - Community ID
 * @param targetUserAddress - Target user address
 * @param targetUserRole - Already resolved target role
 * @param isTargetUserBanned - Whether the target is banned from the community
 * @throws {UserNotCommunityMemberError} When the target is banned, or is not a member of a private community
 */
export function validateCommunityVoiceChatTargetUser(
  community: Community,
  communityId: string,
  targetUserAddress: string,
  targetUserRole: CommunityRole,
  isTargetUserBanned: boolean
): void {
  // A ban survives leaving the room, and a public community does not kick the banned user out of
  // an ongoing call, so it has to be enforced whatever the privacy setting is.
  if (isTargetUserBanned) {
    throw new UserNotCommunityMemberError(targetUserAddress, communityId)
  }

  validateCommunityVoiceChatTargetMembership(community, communityId, targetUserAddress, targetUserRole)
}
