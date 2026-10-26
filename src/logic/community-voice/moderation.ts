import { AppComponents } from '../../types'
import { CommunityRole } from '../../types/entities'
import { CommunityPrivacyEnum } from '../community/types'
import { InvalidCommunityIdError, InvalidUserAddressError, UserNotCommunityMemberError } from './errors'
import {
  validateCommunityVoiceChatModerator,
  validateCommunityVoiceChatTargetMembership,
  validateCommunityVoiceChatTargetUser
} from './validation'

/**
 * What owners and moderators do to other participants of a community voice chat. Every transport
 * (RPC and HTTP) calls these, so the permission rules live in one place.
 */

type ModerationComponents = Pick<AppComponents, 'logs' | 'commsGatekeeper' | 'communitiesDb'>

function assertIdentifiers(communityId: string, targetUserAddress: string): void {
  if (!communityId || communityId.trim() === '') {
    throw new InvalidCommunityIdError()
  }

  if (!targetUserAddress || targetUserAddress.trim() === '') {
    throw new InvalidUserAddressError()
  }
}

export async function promoteSpeakerInCommunityVoiceChat(
  { logs, commsGatekeeper, communitiesDb }: ModerationComponents,
  communityId: string,
  actingUserAddress: string,
  targetUserAddress: string
): Promise<void> {
  const logger = logs.getLogger('community-voice-moderation')

  assertIdentifiers(communityId, targetUserAddress)

  // Owner/moderator gate, owner protection and community lookup issued together. Authorization
  // is reported first on purpose: a caller with no role learns nothing about the community.
  const [community, { actingUserRole, targetUserRole, isTargetUserBanned }] = await Promise.all([
    communitiesDb.getCommunity(communityId, actingUserAddress),
    validateCommunityVoiceChatModerator(
      communitiesDb,
      communityId,
      actingUserAddress,
      targetUserAddress,
      'promote speakers'
    )
  ])

  if (!community) {
    throw new InvalidCommunityIdError()
  }

  // Validate target user can be promoted based on community privacy and membership
  validateCommunityVoiceChatTargetUser(community, communityId, targetUserAddress, targetUserRole, isTargetUserBanned)

  logger.info('Permission check passed: moderator/owner promoting speaker', {
    communityId,
    actingUserRole,
    targetUserAddress,
    communityPrivacy: community.privacy,
    moderatorAddress: actingUserAddress
  })

  await commsGatekeeper.promoteSpeakerInCommunityVoiceChat(communityId, targetUserAddress)
}

/**
 * Demotes a speaker to listener. Anyone can demote themselves; demoting someone else takes an owner
 * or moderator.
 */
export async function demoteSpeakerInCommunityVoiceChat(
  { logs, commsGatekeeper, communitiesDb }: ModerationComponents,
  communityId: string,
  actingUserAddress: string,
  targetUserAddress: string
): Promise<{ isSelfDemote: boolean }> {
  const logger = logs.getLogger('community-voice-moderation')

  assertIdentifiers(communityId, targetUserAddress)

  const isSelfDemote = actingUserAddress.toLowerCase() === targetUserAddress.toLowerCase()

  // getCommunity already resolves the acting user's role, so no extra round-trip here.
  const community = await communitiesDb.getCommunity(communityId, actingUserAddress)
  if (!community) {
    throw new InvalidCommunityIdError()
  }

  const actingUserRole = community.role ?? CommunityRole.None

  // For private communities, acting user must be a member
  // For public communities, we allow voice chat participants to manage themselves and moderators to manage others
  if (community.privacy === CommunityPrivacyEnum.Private && actingUserRole === CommunityRole.None) {
    throw new UserNotCommunityMemberError(actingUserAddress, communityId)
  }

  // If user is trying to demote someone else, check permissions
  if (!isSelfDemote) {
    // Owner/moderator gate; the owner cannot be demoted by anyone else.
    const { targetUserRole, isTargetUserBanned } = await validateCommunityVoiceChatModerator(
      communitiesDb,
      communityId,
      actingUserAddress,
      targetUserAddress,
      'demote other speakers'
    )

    // Validate target user can be demoted based on community privacy and membership
    validateCommunityVoiceChatTargetUser(community, communityId, targetUserAddress, targetUserRole, isTargetUserBanned)

    logger.info('Permission check passed: moderator/owner demoting another user', {
      communityId,
      actingUserRole,
      targetUserAddress,
      communityPrivacy: community.privacy
    })
  } else {
    logger.info('Self-demote detected: allowing user to demote themselves', {
      communityId,
      userAddress: targetUserAddress,
      communityPrivacy: community.privacy
    })
  }

  await commsGatekeeper.demoteSpeakerInCommunityVoiceChat(communityId, targetUserAddress)

  return { isSelfDemote }
}

export async function rejectSpeakRequestInCommunityVoiceChat(
  { logs, commsGatekeeper, communitiesDb }: ModerationComponents,
  communityId: string,
  actingUserAddress: string,
  targetUserAddress: string
): Promise<void> {
  const logger = logs.getLogger('community-voice-moderation')

  assertIdentifiers(communityId, targetUserAddress)

  // Owner/moderator gate, owner protection and community lookup issued together. Authorization
  // is reported first on purpose: a caller with no role learns nothing about the community.
  const [community, { actingUserRole, targetUserRole }] = await Promise.all([
    communitiesDb.getCommunity(communityId, actingUserAddress),
    validateCommunityVoiceChatModerator(
      communitiesDb,
      communityId,
      actingUserAddress,
      targetUserAddress,
      'reject speak requests'
    )
  ])

  if (!community) {
    throw new InvalidCommunityIdError()
  }

  // Public guests can raise a hand; a banned target stays rejectable since denying grants nothing.
  validateCommunityVoiceChatTargetMembership(community, communityId, targetUserAddress, targetUserRole)

  logger.info('Permission check passed: moderator/owner rejecting speak request', {
    communityId,
    actingUserRole,
    targetUserAddress,
    moderatorAddress: actingUserAddress
  })

  await commsGatekeeper.rejectSpeakRequestInCommunityVoiceChat(communityId, targetUserAddress)
}

export async function kickPlayerFromCommunityVoiceChat(
  { logs, commsGatekeeper, communitiesDb }: ModerationComponents,
  communityId: string,
  actingUserAddress: string,
  targetUserAddress: string
): Promise<void> {
  const logger = logs.getLogger('community-voice-moderation')

  assertIdentifiers(communityId, targetUserAddress)

  // Owner/moderator gate; the owner cannot be kicked by anyone else.
  const { actingUserRole } = await validateCommunityVoiceChatModerator(
    communitiesDb,
    communityId,
    actingUserAddress,
    targetUserAddress,
    'kick players'
  )

  // No further target restrictions; comms-gatekeeper validates presence in the room.
  logger.info('Permission check passed: moderator/owner kicking player', {
    communityId,
    actingUserRole,
    targetUserAddress,
    moderatorAddress: actingUserAddress
  })

  await commsGatekeeper.kickUserFromCommunityVoiceChat(communityId, targetUserAddress)
}
